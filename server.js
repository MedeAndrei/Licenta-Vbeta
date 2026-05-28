const express = require('express');
const cors = require('cors');
const path = require('path');
const crypto = require('crypto');
const sequelize = require('./config/db');

const app = express();
const PORT = 5000;

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

/* CONFIGURARI */

const criteriiFirme = {
    denumire: 'f.denumire_firma',
    cui: 'CAST(f.cui AS TEXT)',
    localitate: 'f.localitate',
    judet: 'f.judet',
    forma: 'f.forma_juridica',
    caen: 'fc.cod_caen'
};

const criteriiTop = {
    cifra_afaceri: { coloana: 'd.cifra_afaceri', eticheta: 'Cifra de afaceri' },
    profit_net: { coloana: 'd.profit_net', eticheta: 'Profit net' },
    venituri_totale: { coloana: 'd.venituri_totale', eticheta: 'Venituri totale' },
    cheltuieli_totale: { coloana: 'd.cheltuieli_totale', eticheta: 'Cheltuieli totale' },
    datorii: { coloana: 'd.datorii', eticheta: 'Datorii' },
    active_totale: { coloana: '(d.active_imobilizate + d.active_circulante)', eticheta: 'Active totale' },
    nr_angajati: { coloana: 'd.nr_angajati', eticheta: 'Numar angajati' },
    marja_profitului: { coloana: '((d.profit_net / NULLIF(d.cifra_afaceri, 0)) * 100)', eticheta: 'Marja profitului' },
    productivitate_angajat: { coloana: '(d.cifra_afaceri / NULLIF(d.nr_angajati, 0))', eticheta: 'Productivitate / angajat' },
    grad_indatorare: { coloana: '((d.datorii / NULLIF(d.active_imobilizate + d.active_circulante, 0)) * 100)', eticheta: 'Grad de indatorare' }
};

const AN_MIN = 2016;
const AN_MAX = 2024;

/* UTILITARE GENERALE */

function hashToken(token) {
    return crypto.createHash('sha256').update(token).digest('hex');
}

function genereazaToken() {
    return crypto.randomBytes(32).toString('hex');
}

function hashParola(parola) {
    const salt = crypto.randomBytes(16).toString('hex');
    const hash = crypto.scryptSync(parola, salt, 64).toString('hex');
    return `${salt}:${hash}`;
}

function verificaParola(parola, parolaHash) {
    if (!parolaHash || !parolaHash.includes(':')) return false;

    const [salt, hashSalvat] = parolaHash.split(':');
    const hashVerificare = crypto.scryptSync(parola, salt, 64).toString('hex');

    if (hashSalvat.length !== hashVerificare.length) return false;

    return crypto.timingSafeEqual(
        Buffer.from(hashSalvat, 'hex'),
        Buffer.from(hashVerificare, 'hex')
    );
}

function text(value) {
    return String(value || '').trim();
}

function emailValid(email) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function parolaValida(parola) {
    return typeof parola === 'string' && parola.length >= 6 && !/^\d+$/.test(parola);
}

function nrPozitiv(value, fallback, min, max) {
    const number = Number(value);
    if (!Number.isFinite(number)) return fallback;
    return Math.min(Math.max(Math.trunc(number), min), max);
}

function numar(value) {
    if (value === null || value === undefined || value === '') return null;
    const result = Number(value);
    return Number.isFinite(result) ? result : null;
}

function numarObligatoriu(value, numeCamp, permiteNegativ = false) {
    const result = numar(value);

    if (result === null) {
        throw new Error(`${numeCamp} este obligatoriu si trebuie sa fie numeric.`);
    }

    if (!permiteNegativ && result < 0) {
        throw new Error(`${numeCamp} nu poate fi negativ.`);
    }

    return result;
}

function rotunjeste(value, decimals = 2) {
    if (value === null || value === undefined || !Number.isFinite(Number(value))) return null;
    const factor = 10 ** decimals;
    return Math.round(Number(value) * factor) / factor;
}

function limiteazaScor(value) {
    return Math.max(0, Math.min(100, Math.round(value)));
}

function categorieScor(scor) {
    if (scor >= 80) return 'Foarte bun';
    if (scor >= 65) return 'Bun';
    if (scor >= 50) return 'Mediu';
    if (scor >= 35) return 'Slab';
    return 'Critic';
}

function anRaport(value, fallback = 2024) {
    const an = Number(value || fallback);

    if (!Number.isInteger(an) || an < AN_MIN || an > AN_MAX) {
        throw eroareClient(`Anul trebuie sa fie intre ${AN_MIN} si ${AN_MAX}.`);
    }

    return an;
}

function categorieImm(cifra_afaceri, nr_angajati) {
    const cifra = Number(cifra_afaceri || 0);
    const angajati = Number(nr_angajati || 0);

    if (angajati < 10 && cifra <= 2000000) return 'Microintreprindere';
    if (angajati < 50 && cifra <= 10000000) return 'Intreprindere mica';
    if (angajati < 250 && cifra <= 50000000) return 'Intreprindere mijlocie';
    return 'Intreprindere mare';
}

function trimiteEroare(res, err, mesajImplicit = 'Eroare interna.') {
    if (err && err.statusCode) {
        return res.status(err.statusCode).json({ mesaj: err.message });
    }

    console.error(err);
    return res.status(500).json({ mesaj: mesajImplicit });
}

function eroareClient(mesaj, statusCode = 400) {
    const err = new Error(mesaj);
    err.statusCode = statusCode;
    return err;
}

/* AUTENTIFICARE */

async function autentifica(req, res, next) {
    const header = req.headers.authorization || '';
    const token = header.startsWith('Bearer ') ? header.slice(7) : '';

    if (!token) {
        return res.status(401).json({ mesaj: 'Trebuie sa fii autentificat.' });
    }

    try {
        const tokenHash = hashToken(token);

        const [rows] = await sequelize.query(`
            SELECT u.id_utilizator, u.nume, u.email
            FROM sesiuni_utilizator s
            JOIN utilizatori u
                ON s.id_utilizator = u.id_utilizator
            WHERE s.token_hash = :tokenHash
              AND s.expira_la > CURRENT_TIMESTAMP
            LIMIT 1
        `, {
            replacements: { tokenHash }
        });

        if (rows.length === 0) {
            return res.status(401).json({ mesaj: 'Sesiune expirata sau invalida.' });
        }

        req.utilizator = rows[0];
        next();
    } catch (err) {
        trimiteEroare(res, err, 'Eroare la autentificare.');
    }
}

/* VALIDARI DOMENIU */

function valideazaFirmaUtilizator(body, id_utilizator) {
    const denumire_firma = text(body.denumire_firma);
    const cuiText = text(body.cui);
    const cod_caen = text(body.cod_caen);
    const judet = text(body.judet);
    const localitate = text(body.localitate);
    const forma_juridica = text(body.forma_juridica);

    if (denumire_firma.length < 2) {
        throw eroareClient('Denumirea firmei este obligatorie si trebuie sa aiba minim 2 caractere.');
    }

    if (!/^\d{2,10}$/.test(cuiText)) {
        throw eroareClient('CUI invalid. Introdu doar cifre, intre 2 si 10 caractere.');
    }

    if (cod_caen && !/^\d{4}$/.test(cod_caen)) {
        throw eroareClient('Codul CAEN trebuie sa contina 4 cifre.');
    }

    return {
        id_utilizator,
        denumire_firma,
        cui: Number(cuiText),
        cuiText,
        cod_caen: cod_caen || null,
        judet: judet || null,
        localitate: localitate || null,
        forma_juridica: forma_juridica || null
    };
}

function valideazaDateFinanciare(body) {
    const an = Number(body.an);

    if (!Number.isInteger(an) || an < AN_MIN || an > AN_MAX) {
        throw eroareClient(`Anul trebuie sa fie intre ${AN_MIN} si ${AN_MAX}, pentru a ramane comparabil cu baza financiara oficiala.`);
    }

    const id_firma = Number(body.id_firma);

    if (!Number.isInteger(id_firma) || id_firma <= 0) {
        throw eroareClient('ID firma este obligatoriu si trebuie sa fie valid.');
    }

    const nr_angajati = numarObligatoriu(body.nr_angajati, 'Numarul de angajati');

    if (!Number.isInteger(Number(nr_angajati))) {
        throw eroareClient('Numarul de angajati trebuie sa fie numar intreg.');
    }

    const date = {
        id_firma,
        an,
        cifra_afaceri: numarObligatoriu(body.cifra_afaceri, 'Cifra de afaceri'),
        venituri_totale: numarObligatoriu(body.venituri_totale, 'Veniturile totale'),
        cheltuieli_totale: numarObligatoriu(body.cheltuieli_totale, 'Cheltuielile totale'),
        profit_net: numarObligatoriu(body.profit_net, 'Profitul net', true),
        datorii: numarObligatoriu(body.datorii, 'Datoriile'),
        active_totale: numarObligatoriu(body.active_totale, 'Activele totale'),
        nr_angajati
    };

    if (date.datorii > 0 && date.active_totale <= 0) {
        throw eroareClient('Activele totale trebuie sa fie mai mari decat 0 daca firma are datorii.');
    }

    if (date.venituri_totale > 0 && date.cheltuieli_totale > date.venituri_totale * 3) {
        throw eroareClient('Cheltuielile totale par disproportionat de mari fata de venituri. Verifica valorile introduse.');
    }

    return date;
}

/* QUERY HELPERS */

function conditieCautare(criteriu, search) {
    if (criteriu === 'cui') {
        return {
            sql: 'CAST(f.cui AS TEXT) LIKE :searchPrefix',
            replacements: { searchPrefix: `${search}%` }
        };
    }

    if (criteriu === 'caen') {
        return {
            sql: 'fc.cod_caen LIKE :searchPrefix',
            replacements: { searchPrefix: `${search}%` }
        };
    }

    const coloana = criteriiFirme[criteriu] || criteriiFirme.denumire;

    return {
        sql: `${coloana} ILIKE :searchContains`,
        replacements: { searchContains: `%${search}%` }
    };
}

async function verificaFirmaUtilizator(id_firma, id_utilizator) {
    const [rows] = await sequelize.query(`
        SELECT *
        FROM firme_utilizator
        WHERE id_firma = :id_firma
          AND id_utilizator = :id_utilizator
        LIMIT 1
    `, {
        replacements: { id_firma, id_utilizator }
    });

    return rows[0] || null;
}

async function obtineCodCaenPrincipal(nr_inregistrare) {
    if (!nr_inregistrare) return null;

    const [rows] = await sequelize.query(`
        SELECT cod_caen
        FROM firme_caen
        WHERE nr_inregistrare = :nr_inregistrare
        ORDER BY cod_caen
        LIMIT 1
    `, {
        replacements: { nr_inregistrare }
    });

    return rows[0]?.cod_caen || null;
}

async function obtinePiataCaen(cod_caen, an) {
    if (!cod_caen || !an) return null;

    const [rows] = await sequelize.query(`
        SELECT
            COUNT(DISTINCT f.cui) AS numar_firme_piata,
            AVG(d.cifra_afaceri) AS medie_cifra_afaceri,
            AVG(d.profit_net) AS medie_profit_net,
            AVG(d.nr_angajati) AS medie_angajati,
            AVG((d.profit_net / NULLIF(d.cifra_afaceri, 0)) * 100) AS medie_marja_profit,
            AVG((d.cheltuieli_totale / NULLIF(d.venituri_totale, 0)) * 100) AS medie_rata_cheltuieli,
            AVG((d.cifra_afaceri / NULLIF(d.nr_angajati, 0))) AS medie_productivitate,
            AVG((d.datorii / NULLIF(d.active_imobilizate + d.active_circulante, 0)) * 100) AS medie_grad_indatorare
        FROM date_financiare d
        JOIN firme f
            ON d.cui::BIGINT = f.cui
        JOIN firme_caen fc
            ON f.nr_inregistrare = fc.nr_inregistrare
        WHERE d.an = :an
          AND fc.cod_caen = :cod_caen
    `, {
        replacements: { cod_caen, an }
    });

    return rows[0] || null;
}

async function obtineComparatieCaenRapida(cod_caen, an, firmaAnalizata) {
    if (!cod_caen || !an) {
        return {
            piata: null,
            pozitii_piata: {},
            top_caen: []
        };
    }

    const valori = {
        an,
        cod_caen,
        cifra_afaceri: numar(firmaAnalizata.cifra_afaceri),
        profit_net: numar(firmaAnalizata.profit_net),
        marja_profitului: numar(firmaAnalizata.marja_profitului),
        productivitate_angajat: numar(firmaAnalizata.productivitate_angajat),
        grad_indatorare: numar(firmaAnalizata.grad_indatorare)
    };

    const queryBaza = `
        FROM date_financiare d
        JOIN firme f
            ON d.cui::BIGINT = f.cui
        JOIN firme_caen fc
            ON f.nr_inregistrare = fc.nr_inregistrare
        WHERE d.an = :an
          AND fc.cod_caen = :cod_caen
    `;

    const [statisticiPromise, topPromise] = await Promise.all([
        sequelize.query(`
            WITH piata AS (
                SELECT DISTINCT
                    f.cui,
                    d.cifra_afaceri,
                    d.profit_net,
                    d.nr_angajati,
                    ((d.profit_net / NULLIF(d.cifra_afaceri, 0)) * 100) AS marja_profitului,
                    ((d.cheltuieli_totale / NULLIF(d.venituri_totale, 0)) * 100) AS rata_cheltuieli,
                    (d.cifra_afaceri / NULLIF(d.nr_angajati, 0)) AS productivitate_angajat,
                    ((d.datorii / NULLIF(d.active_imobilizate + d.active_circulante, 0)) * 100) AS grad_indatorare
                ${queryBaza}
            )
            SELECT
                COUNT(*) AS numar_firme_piata,
                AVG(cifra_afaceri) AS medie_cifra_afaceri,
                AVG(profit_net) AS medie_profit_net,
                AVG(nr_angajati) AS medie_angajati,
                AVG(marja_profitului) AS medie_marja_profit,
                AVG(rata_cheltuieli) AS medie_rata_cheltuieli,
                AVG(productivitate_angajat) AS medie_productivitate,
                AVG(grad_indatorare) AS medie_grad_indatorare,
                COUNT(*) FILTER (WHERE cifra_afaceri > :cifra_afaceri) + 1 AS pozitie_cifra_afaceri,
                COUNT(*) FILTER (WHERE profit_net > :profit_net) + 1 AS pozitie_profit_net,
                COUNT(*) FILTER (WHERE marja_profitului > :marja_profitului) + 1 AS pozitie_marja_profitului,
                COUNT(*) FILTER (WHERE productivitate_angajat > :productivitate_angajat) + 1 AS pozitie_productivitate_angajat,
                COUNT(*) FILTER (WHERE grad_indatorare < :grad_indatorare) + 1 AS pozitie_grad_indatorare
            FROM piata
        `, {
            replacements: valori
        }),
        sequelize.query(`
            SELECT
                ROW_NUMBER() OVER (ORDER BY d.cifra_afaceri DESC NULLS LAST) AS pozitie,
                f.denumire_firma,
                f.cui,
                f.judet,
                f.localitate,
                d.cifra_afaceri,
                d.profit_net,
                d.nr_angajati,
                ROUND((d.profit_net / NULLIF(d.cifra_afaceri, 0)) * 100, 2) AS marja_profitului,
                ROUND((d.cifra_afaceri / NULLIF(d.nr_angajati, 0)), 2) AS productivitate_angajat,
                ROUND((d.datorii / NULLIF(d.active_imobilizate + d.active_circulante, 0)) * 100, 2) AS grad_indatorare
            ${queryBaza}
              AND d.cifra_afaceri IS NOT NULL
            ORDER BY d.cifra_afaceri DESC NULLS LAST
            LIMIT 10
        `, {
            replacements: {
                an,
                cod_caen
            }
        })
    ]);

    const statistici = statisticiPromise[0][0] || {};

    return {
        piata: statistici,
        top_caen: topPromise[0],
        pozitii_piata: {
            cifra_afaceri: valori.cifra_afaceri === null ? null : Number(statistici.pozitie_cifra_afaceri || 0) || null,
            profit_net: valori.profit_net === null ? null : Number(statistici.pozitie_profit_net || 0) || null,
            marja_profitului: valori.marja_profitului === null ? null : Number(statistici.pozitie_marja_profitului || 0) || null,
            productivitate_angajat: valori.productivitate_angajat === null ? null : Number(statistici.pozitie_productivitate_angajat || 0) || null,
            grad_indatorare: valori.grad_indatorare === null ? null : Number(statistici.pozitie_grad_indatorare || 0) || null
        }
    };
}

async function verificaUnicitateFirmaUtilizator(firma) {
    const [cuiPublic] = await sequelize.query(`
        SELECT cui
        FROM firme
        WHERE CAST(cui AS TEXT) = :cui
        LIMIT 1
    `, {
        replacements: { cui: firma.cuiText }
    });

    if (cuiPublic.length > 0) {
        throw eroareClient('CUI invalid: exista deja firma cu acel CUI in baza oficiala.');
    }

    const [cuiUser] = await sequelize.query(`
        SELECT id_firma
        FROM firme_utilizator
        WHERE cui = :cui
        LIMIT 1
    `, {
        replacements: { cui: firma.cui }
    });

    if (cuiUser.length > 0) {
        throw eroareClient('CUI invalid: exista deja firma cu acel CUI.');
    }

    const [numePublic] = await sequelize.query(`
        SELECT denumire_firma
        FROM firme
        WHERE LOWER(TRIM(denumire_firma)) = LOWER(:denumire_firma)
        LIMIT 1
    `, {
        replacements: { denumire_firma: firma.denumire_firma }
    });

    if (numePublic.length > 0) {
        throw eroareClient('Denumire invalida: exista deja firma cu acest nume in baza oficiala.');
    }

    const [numeUser] = await sequelize.query(`
        SELECT id_firma
        FROM firme_utilizator
        WHERE LOWER(TRIM(denumire_firma)) = LOWER(:denumire_firma)
        LIMIT 1
    `, {
        replacements: { denumire_firma: firma.denumire_firma }
    });

    if (numeUser.length > 0) {
        throw eroareClient('Denumire invalida: exista deja firma cu acest nume.');
    }
}

/* DIAGNOSTIC FINANCIAR */

function scorComparativ(value, medie, inverse = false) {
    const v = numar(value);
    const m = numar(medie);

    if (!v || !m || m === 0) return null;

    const raport = inverse ? m / v : v / m;
    return limiteazaScor(50 + (raport - 1) * 50);
}

function medieScoruri(values, fallback) {
    const scoruri = values.filter(value => value !== null && value !== undefined && Number.isFinite(Number(value)));
    if (scoruri.length === 0) return fallback;

    return limiteazaScor(
        scoruri.reduce((sum, value) => sum + Number(value), 0) / scoruri.length
    );
}

function calculeazaDiagnosticDinIstoric(istoric, piata = null) {
    const ultimulAn = istoric[istoric.length - 1];
    const penultimulAn = istoric.length > 1 ? istoric[istoric.length - 2] : null;

    const cifraAfaceri = numar(ultimulAn.cifra_afaceri);
    const venituriTotale = numar(ultimulAn.venituri_totale);
    const cheltuieliTotale = numar(ultimulAn.cheltuieli_totale);
    const profitNet = numar(ultimulAn.profit_net);
    const datorii = numar(ultimulAn.datorii);
    const activeTotale = numar(ultimulAn.active_totale);
    const angajati = numar(ultimulAn.nr_angajati);

    const cifraAfaceriAnterior = penultimulAn ? numar(penultimulAn.cifra_afaceri) : null;
    const profitAnterior = penultimulAn ? numar(penultimulAn.profit_net) : null;

    const marjaProfitului = cifraAfaceri ? (profitNet / cifraAfaceri) * 100 : null;
    const rataCheltuielilor = venituriTotale ? (cheltuieliTotale / venituriTotale) * 100 : null;
    const productivitateAngajat = angajati ? cifraAfaceri / angajati : null;
    const gradIndatorare = activeTotale ? (datorii / activeTotale) * 100 : null;
    const rentabilitateActive = activeTotale ? (profitNet / activeTotale) * 100 : null;

    const evolutieCifraAfaceri = cifraAfaceriAnterior
        ? ((cifraAfaceri - cifraAfaceriAnterior) / Math.abs(cifraAfaceriAnterior)) * 100
        : null;

    const evolutieProfit = profitAnterior
        ? ((profitNet - profitAnterior) / Math.abs(profitAnterior)) * 100
        : null;

    const scorProfitabilitateAbsolut = limiteazaScor(
        45 +
        (marjaProfitului || 0) * 2.2 +
        (rentabilitateActive || 0) * 1.4 +
        (profitNet > 0 ? 15 : -25)
    );

    const scorEficientaAbsolut = limiteazaScor(
        70 -
        Math.max(0, (rataCheltuielilor || 100) - 75) * 1.3 +
        Math.min(20, Math.max(0, (productivitateAngajat || 0) / 100000))
    );

    const scorRiscAbsolut = limiteazaScor(
        100 -
        Math.max(0, (gradIndatorare || 0) - 35) * 1.35 -
        (profitNet < 0 ? 20 : 0) -
        (cifraAfaceri && cifraAfaceri < 100000 ? 8 : 0)
    );

    const scorCrestere = limiteazaScor(
        50 +
        Math.max(-30, Math.min(30, evolutieCifraAfaceri || 0)) +
        Math.max(-20, Math.min(20, (evolutieProfit || 0) / 2))
    );

    const scorProfitabilitate = medieScoruri([
        scorProfitabilitateAbsolut,
        scorComparativ(profitNet, piata?.medie_profit_net),
        scorComparativ(marjaProfitului, piata?.medie_marja_profit)
    ], scorProfitabilitateAbsolut);

    const scorEficienta = medieScoruri([
        scorEficientaAbsolut,
        scorComparativ(productivitateAngajat, piata?.medie_productivitate),
        scorComparativ(rataCheltuielilor, piata?.medie_rata_cheltuieli, true)
    ], scorEficientaAbsolut);

    const scorRisc = medieScoruri([
        scorRiscAbsolut,
        scorComparativ(gradIndatorare, piata?.medie_grad_indatorare, true)
    ], scorRiscAbsolut);

    const scorGeneral = limiteazaScor(
        scorProfitabilitate * 0.35 +
        scorEficienta * 0.25 +
        scorRisc * 0.20 +
        scorCrestere * 0.20
    );

    return {
        an_analiza: ultimulAn.an,
        indicatori: {
            cifra_afaceri: rotunjeste(cifraAfaceri),
            venituri_totale: rotunjeste(venituriTotale),
            cheltuieli_totale: rotunjeste(cheltuieliTotale),
            profit_net: rotunjeste(profitNet),
            datorii: rotunjeste(datorii),
            active_totale: rotunjeste(activeTotale),
            nr_angajati: rotunjeste(angajati),
            marja_profitului: rotunjeste(marjaProfitului),
            rata_cheltuielilor: rotunjeste(rataCheltuielilor),
            productivitate_angajat: rotunjeste(productivitateAngajat),
            grad_indatorare: rotunjeste(gradIndatorare),
            rentabilitate_active: rotunjeste(rentabilitateActive),
            evolutie_cifra_afaceri: rotunjeste(evolutieCifraAfaceri),
            evolutie_profit: rotunjeste(evolutieProfit)
        },
        scoruri: {
            profitabilitate: scorProfitabilitate,
            eficienta: scorEficienta,
            risc: scorRisc,
            crestere: scorCrestere,
            general: scorGeneral,
            categorie: categorieScor(scorGeneral)
        },
        explicatii_scoruri: {
            profitabilitate: 'Scor influentat de profit net, marja profitului si rentabilitatea activelor.',
            eficienta: 'Scor influentat de rata cheltuielilor si productivitatea pe angajat.',
            risc: 'Scor influentat de gradul de indatorare, profitabilitate si nivelul activelor.',
            crestere: 'Scor influentat de evolutia cifrei de afaceri si a profitului fata de anul anterior.'
        }
    };
}

function genereazaInterpretareDiagnostic(firma, diagnostic, piata = null) {
    const { indicatori, scoruri } = diagnostic;
    const concluzii = [];
    const puncteForte = [];
    const riscuri = [];
    const recomandari = [];

    if (scoruri.general >= 75) {
        concluzii.push('Firma are o pozitie financiara solida si indicatori generali favorabili.');
    } else if (scoruri.general >= 50) {
        concluzii.push('Firma are o situatie financiara medie, cu performante acceptabile, dar si zone care trebuie monitorizate.');
    } else {
        concluzii.push('Firma prezinta vulnerabilitati financiare si necesita masuri de imbunatatire.');
    }

    if (piata?.numar_firme_piata) {
        concluzii.push(`Diagnosticul include compararea cu ${piata.numar_firme_piata} firme din acelasi cod CAEN pentru anul analizat.`);
    }

    if ((indicatori.marja_profitului || 0) > 10) {
        puncteForte.push('Marja profitului este buna, ceea ce indica o capacitate favorabila de transformare a vanzarilor in profit.');
    } else if ((indicatori.marja_profitului || 0) > 0) {
        concluzii.push('Firma este profitabila, dar marja este redusa si poate fi vulnerabila la cresterea costurilor.');
    } else {
        riscuri.push('Profitabilitatea este negativa sau foarte slaba.');
        recomandari.push('Analizeaza structura costurilor si identifica zonele unde cheltuielile pot fi reduse.');
    }

    if ((indicatori.grad_indatorare || 0) > 70) {
        riscuri.push('Gradul de indatorare este ridicat si poate afecta stabilitatea financiara.');
        recomandari.push('Urmareste reducerea datoriilor sau cresterea bazei de active/capital propriu.');
    } else if ((indicatori.grad_indatorare || 0) < 40) {
        puncteForte.push('Gradul de indatorare este moderat, ceea ce sugereaza o structura financiara mai stabila.');
    }

    if ((indicatori.rata_cheltuielilor || 0) > 90) {
        riscuri.push('Cheltuielile consuma o parte foarte mare din venituri.');
        recomandari.push('Imbunatateste controlul cheltuielilor operationale si urmareste eficienta costurilor.');
    }

    if ((indicatori.evolutie_cifra_afaceri || 0) > 10) {
        puncteForte.push('Cifra de afaceri este in crestere semnificativa fata de anul anterior.');
    } else if ((indicatori.evolutie_cifra_afaceri || 0) < -10) {
        riscuri.push('Cifra de afaceri este in scadere semnificativa fata de anul anterior.');
        recomandari.push('Revizuieste strategia comerciala si pozitionarea fata de concurenta.');
    }

    if ((indicatori.evolutie_profit || 0) < -10) {
        riscuri.push('Profitul este in scadere fata de anul anterior.');
        recomandari.push('Verifica daca scaderea profitului vine din costuri, preturi, volum de vanzari sau productivitate.');
    }

    if (puncteForte.length === 0) {
        puncteForte.push('Firma are date suficiente pentru monitorizare financiara si comparatii periodice.');
    }

    if (riscuri.length === 0) {
        riscuri.push('Nu apar riscuri majore pe baza indicatorilor calculati, dar monitorizarea trebuie continuata.');
    }

    if (recomandari.length === 0) {
        recomandari.push('Continua monitorizarea indicatorilor si compara periodic rezultatele cu media sectorului CAEN.');
    }

    return {
        concluzie_generala: `${firma.denumire_firma} obtine scorul general ${scoruri.general}/100, incadrat ca "${scoruri.categorie}".`,
        concluzii,
        puncte_forte: puncteForte,
        riscuri,
        recomandari
    };
}

/* PREGATIRE BAZA DE DATE */

async function pregatesteTabeleGestiune() {
    await sequelize.query(`
        CREATE TABLE IF NOT EXISTS utilizatori (
            id_utilizator SERIAL PRIMARY KEY,
            nume VARCHAR(150) NOT NULL,
            email VARCHAR(150) NOT NULL UNIQUE,
            parola_hash TEXT NOT NULL,
            data_creare TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
    `);

    await sequelize.query(`
        CREATE TABLE IF NOT EXISTS sesiuni_utilizator (
            id_sesiune SERIAL PRIMARY KEY,
            id_utilizator INT NOT NULL REFERENCES utilizatori(id_utilizator) ON DELETE CASCADE,
            token_hash TEXT NOT NULL UNIQUE,
            data_creare TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            expira_la TIMESTAMP NOT NULL
        );
    `);

    await sequelize.query(`
        CREATE TABLE IF NOT EXISTS firme_utilizator (
            id_firma SERIAL PRIMARY KEY,
            id_utilizator INT REFERENCES utilizatori(id_utilizator) ON DELETE CASCADE,
            denumire_firma TEXT NOT NULL,
            cui BIGINT,
            cod_caen VARCHAR(20),
            judet VARCHAR(100),
            localitate VARCHAR(150),
            forma_juridica VARCHAR(50),
            data_adaugare TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
    `);

    await sequelize.query(`
        ALTER TABLE firme_utilizator
        ADD COLUMN IF NOT EXISTS id_utilizator INT REFERENCES utilizatori(id_utilizator) ON DELETE CASCADE;
    `);

    await sequelize.query(`
        ALTER TABLE firme_utilizator
        ADD COLUMN IF NOT EXISTS data_adaugare TIMESTAMP DEFAULT CURRENT_TIMESTAMP;
    `);

    await sequelize.query(`
        CREATE TABLE IF NOT EXISTS date_financiare_utilizator (
            id_date SERIAL PRIMARY KEY,
            id_firma INT REFERENCES firme_utilizator(id_firma) ON DELETE CASCADE,
            an INT NOT NULL,
            cifra_afaceri NUMERIC,
            venituri_totale NUMERIC,
            cheltuieli_totale NUMERIC,
            profit_net NUMERIC,
            datorii NUMERIC,
            active_totale NUMERIC,
            nr_angajati NUMERIC,
            data_adaugare TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
    `);

    await sequelize.query(`
        ALTER TABLE date_financiare_utilizator
        ADD COLUMN IF NOT EXISTS data_adaugare TIMESTAMP DEFAULT CURRENT_TIMESTAMP;
    `);
}

async function pregatesteIndexuriCautare() {
    const indexuriPornire = [
        `CREATE INDEX IF NOT EXISTS idx_firme_utilizator_owner ON firme_utilizator (id_utilizator);`,
        `CREATE INDEX IF NOT EXISTS idx_firme_utilizator_cui ON firme_utilizator (cui);`,
        `CREATE INDEX IF NOT EXISTS idx_date_user_firma_an ON date_financiare_utilizator (id_firma, an);`
    ];

    for (const sql of indexuriPornire) {
        try {
            await sequelize.query(sql);
        } catch (err) {
            console.warn('Un index auxiliar nu a putut fi verificat la pornire.', err.message);
        }
    }
}

async function curataSesiuniLaPornire() {
    await sequelize.query(`DELETE FROM sesiuni_utilizator;`);
}

/* AUTENTIFICARE */

app.post('/api/register', async (req, res) => {
    const nume = text(req.body.nume);
    const email = text(req.body.email).toLowerCase();
    const parola = String(req.body.parola || '');

    if (!nume || !emailValid(email) || !parolaValida(parola)) {
        return res.status(400).json({
            mesaj: 'Completeaza numele, un email valid si o parola de minim 6 caractere care nu este formata doar din cifre.'
        });
    }

    try {
        const parola_hash = hashParola(parola);

        const [result] = await sequelize.query(`
            INSERT INTO utilizatori (nume, email, parola_hash)
            VALUES (:nume, :email, :parola_hash)
            RETURNING id_utilizator, nume, email
        `, {
            replacements: { nume, email, parola_hash }
        });

        res.json({
            utilizator: result[0],
            mesaj: 'Cont creat cu succes. Te poti autentifica.'
        });
    } catch (err) {
        if (err.original && err.original.code === '23505') {
            return res.status(400).json({ mesaj: 'Exista deja un cont cu acest email.' });
        }

        trimiteEroare(res, err, 'Eroare la crearea contului.');
    }
});

app.post('/api/login', async (req, res) => {
    const email = text(req.body.email).toLowerCase();
    const parola = String(req.body.parola || '');

    if (!emailValid(email) || !parola) {
        return res.status(400).json({ mesaj: 'Completeaza un email valid si parola.' });
    }

    try {
        const [users] = await sequelize.query(`
            SELECT id_utilizator, nume, email, parola_hash
            FROM utilizatori
            WHERE email = :email
            LIMIT 1
        `, {
            replacements: { email }
        });

        if (users.length === 0 || !verificaParola(parola, users[0].parola_hash)) {
            return res.status(401).json({ mesaj: 'Email sau parola incorecta.' });
        }

        const token = genereazaToken();
        const tokenHash = hashToken(token);

        await sequelize.query(`
            INSERT INTO sesiuni_utilizator (id_utilizator, token_hash, expira_la)
            VALUES (:id_utilizator, :tokenHash, CURRENT_TIMESTAMP + INTERVAL '7 days')
        `, {
            replacements: {
                id_utilizator: users[0].id_utilizator,
                tokenHash
            }
        });

        res.json({
            token,
            utilizator: {
                id_utilizator: users[0].id_utilizator,
                nume: users[0].nume,
                email: users[0].email
            }
        });
    } catch (err) {
        trimiteEroare(res, err, 'Eroare la autentificare.');
    }
});

app.post('/api/logout', autentifica, async (req, res) => {
    const header = req.headers.authorization || '';
    const token = header.startsWith('Bearer ') ? header.slice(7) : '';

    await sequelize.query(`
        DELETE FROM sesiuni_utilizator
        WHERE token_hash = :tokenHash
    `, {
        replacements: { tokenHash: hashToken(token) }
    });

    res.json({ mesaj: 'Delogat cu succes.' });
});

app.get('/api/me', autentifica, async (req, res) => {
    res.json({ utilizator: req.utilizator });
});

/* CAUTARE FIRME PUBLICE */

app.get('/api/firme', async (req, res) => {
    const search = text(req.query.search);
    const criteriu = text(req.query.criteriu) || 'denumire';
    const page = nrPozitiv(req.query.page, 1, 1, 100000);
    const limit = nrPozitiv(req.query.limit, 20, 5, 100);
    const offset = (page - 1) * limit;
    const limitPlusOne = limit + 1;

    if (search.length < 2) {
        return res.status(400).json({ mesaj: 'Introdu minim 2 caractere.' });
    }

    let conditieSql = 'f.denumire_firma ILIKE :searchContains';

    if (criteriu === 'cui') conditieSql = 'CAST(f.cui AS TEXT) LIKE :searchPrefix';
    if (criteriu === 'localitate') conditieSql = 'f.localitate ILIKE :searchContains';
    if (criteriu === 'judet') conditieSql = 'f.judet ILIKE :searchContains';
    if (criteriu === 'forma') conditieSql = 'f.forma_juridica ILIKE :searchContains';

    if (criteriu === 'caen') {
        conditieSql = `
            EXISTS (
                SELECT 1
                FROM firme_caen fc_filtru
                WHERE fc_filtru.nr_inregistrare = f.nr_inregistrare
                  AND fc_filtru.cod_caen LIKE :searchPrefix
            )
        `;
    }

    try {
        const [results] = await sequelize.query(`
            WITH firme_pagina AS (
                SELECT
                    f.denumire_firma,
                    f.cui,
                    f.nr_inregistrare,
                    f.judet,
                    f.localitate,
                    f.forma_juridica,
                    sf.cod_stare
                FROM firme f
                LEFT JOIN stari_firme sf
                    ON f.nr_inregistrare = sf.nr_inregistrare
                WHERE ${conditieSql}
                  AND f.denumire_firma IS NOT NULL AND TRIM(f.denumire_firma) <> ''
                  AND f.cui IS NOT NULL
                  AND f.nr_inregistrare IS NOT NULL AND TRIM(f.nr_inregistrare) <> ''
                  AND f.judet IS NOT NULL AND TRIM(f.judet) <> ''
                  AND f.localitate IS NOT NULL AND TRIM(f.localitate) <> ''
                  AND f.forma_juridica IS NOT NULL AND TRIM(f.forma_juridica) <> ''
                  AND sf.cod_stare IS NOT NULL AND TRIM(sf.cod_stare) <> ''
                  AND EXISTS (
                      SELECT 1
                      FROM firme_caen fc_valid
                      JOIN coduri_caen cc_valid
                          ON fc_valid.cod_caen = cc_valid.cod_caen
                      WHERE fc_valid.nr_inregistrare = f.nr_inregistrare
                        AND fc_valid.cod_caen IS NOT NULL
                        AND TRIM(fc_valid.cod_caen) <> ''
                        AND cc_valid.denumire_caen IS NOT NULL
                        AND TRIM(cc_valid.denumire_caen) <> ''
                  )
                ORDER BY f.denumire_firma
                LIMIT :limit OFFSET :offset
            )
            SELECT
                fp.*,
                (
                    SELECT STRING_AGG(DISTINCT fc.cod_caen, ', ')
                    FROM firme_caen fc
                    WHERE fc.nr_inregistrare = fp.nr_inregistrare
                ) AS coduri_caen,
                (
                    SELECT STRING_AGG(DISTINCT cc.denumire_caen, ' | ')
                    FROM firme_caen fc
                    JOIN coduri_caen cc
                        ON fc.cod_caen = cc.cod_caen
                    WHERE fc.nr_inregistrare = fp.nr_inregistrare
                ) AS denumiri_caen
            FROM firme_pagina fp
            ORDER BY fp.denumire_firma
        `, {
            replacements: {
                searchContains: `%${search}%`,
                searchPrefix: `${search}%`,
                limit: limitPlusOne,
                offset
            }
        });

        res.json({
            data: results.slice(0, limit),
            page,
            limit,
            hasNext: results.length > limit
        });
    } catch (err) {
        trimiteEroare(res, err, 'Eroare la cautarea firmelor.');
    }
});

app.get('/api/firme-financiare', async (req, res) => {
    const search = text(req.query.search);
    const criteriu = text(req.query.criteriu) || 'denumire';
    const page = nrPozitiv(req.query.page, 1, 1, 100000);
    const limit = nrPozitiv(req.query.limit, 10, 5, 50);
    const offset = (page - 1) * limit;

    if (search.length < 2) {
        return res.status(400).json({ mesaj: 'Introdu minim 2 caractere.' });
    }

    const conditie = conditieCautare(criteriu, search);

    try {
        const replacements = {
            ...conditie.replacements,
            limit,
            offset
        };

        const [countRows] = await sequelize.query(`
            SELECT COUNT(DISTINCT f.cui) AS total
            FROM firme f
            JOIN date_financiare d
                ON f.cui = d.cui::BIGINT
            LEFT JOIN firme_caen fc
                ON f.nr_inregistrare = fc.nr_inregistrare
            WHERE ${conditie.sql}
              AND f.cui IS NOT NULL
              AND f.cui <> 0
        `, { replacements });

        const total = Number(countRows[0]?.total || 0);

        const [results] = await sequelize.query(`
            SELECT
                f.denumire_firma,
                f.cui,
                f.nr_inregistrare,
                f.judet,
                f.localitate,
                f.forma_juridica,
                STRING_AGG(DISTINCT fc.cod_caen, ', ') AS coduri_caen,
                MIN(d.an) AS primul_an,
                MAX(d.an) AS ultimul_an
            FROM firme f
            JOIN date_financiare d
                ON f.cui = d.cui::BIGINT
            LEFT JOIN firme_caen fc
                ON f.nr_inregistrare = fc.nr_inregistrare
            WHERE ${conditie.sql}
              AND f.cui IS NOT NULL
              AND f.cui <> 0
            GROUP BY
                f.denumire_firma,
                f.cui,
                f.nr_inregistrare,
                f.judet,
                f.localitate,
                f.forma_juridica
            ORDER BY f.denumire_firma
            LIMIT :limit OFFSET :offset
        `, { replacements });

        res.json({
            data: results,
            page,
            limit,
            total,
            totalPages: Math.ceil(total / limit)
        });
    } catch (err) {
        trimiteEroare(res, err, 'Eroare la cautarea firmelor financiare.');
    }
});

/* ANALIZA SI DIAGNOSTIC PUBLIC */

app.get('/api/analiza-financiara', async (req, res) => {
    const cui = text(req.query.cui);

    if (!cui) {
        return res.status(400).json({ mesaj: 'CUI lipsa.' });
    }

    try {
        const [results] = await sequelize.query(`
            SELECT
                an,
                cifra_afaceri,
                venituri_totale,
                cheltuieli_totale,
                profit_net,
                datorii,
                active_imobilizate + active_circulante AS active_totale,
                nr_angajati,
                ROUND((profit_net / NULLIF(cifra_afaceri, 0)) * 100, 2) AS marja_profitului,
                ROUND((cheltuieli_totale / NULLIF(venituri_totale, 0)) * 100, 2) AS rata_cheltuielilor,
                ROUND((cifra_afaceri / NULLIF(nr_angajati, 0)), 2) AS productivitate_angajat,
                ROUND((datorii / NULLIF(active_imobilizate + active_circulante, 0)) * 100, 2) AS grad_indatorare,
                ROUND(((cifra_afaceri - LAG(cifra_afaceri) OVER (ORDER BY an)) / NULLIF(LAG(cifra_afaceri) OVER (ORDER BY an), 0)) * 100, 2) AS evolutie_cifra_afaceri,
                ROUND(((profit_net - LAG(profit_net) OVER (ORDER BY an)) / NULLIF(ABS(LAG(profit_net) OVER (ORDER BY an)), 0)) * 100, 2) AS evolutie_profit
            FROM date_financiare
            WHERE TRIM(cui) = :cui
            ORDER BY an
        `, {
            replacements: { cui }
        });

        res.json(results);
    } catch (err) {
        trimiteEroare(res, err, 'Eroare la analiza financiara.');
    }
});

app.get('/api/diagnostic-financiar', async (req, res) => {
    const cui = text(req.query.cui);

    if (!cui) {
        return res.status(400).json({ mesaj: 'CUI lipsa.' });
    }

    try {
        const [firmaRows] = await sequelize.query(`
            SELECT denumire_firma, cui, nr_inregistrare, judet, localitate, forma_juridica
            FROM firme
            WHERE CAST(cui AS TEXT) = :cui
            LIMIT 1
        `, {
            replacements: { cui }
        });

        if (firmaRows.length === 0) {
            return res.status(404).json({ mesaj: 'Firma nu a fost gasita.' });
        }

        const [istoric] = await sequelize.query(`
            SELECT
                an,
                cifra_afaceri,
                venituri_totale,
                cheltuieli_totale,
                profit_net,
                datorii,
                active_imobilizate + active_circulante AS active_totale,
                nr_angajati
            FROM date_financiare
            WHERE TRIM(cui) = :cui
            ORDER BY an
        `, {
            replacements: { cui }
        });

        if (istoric.length === 0) {
            return res.status(404).json({ mesaj: 'Firma nu are date financiare disponibile.' });
        }

        const codCaen = await obtineCodCaenPrincipal(firmaRows[0].nr_inregistrare);
        const piata = await obtinePiataCaen(codCaen, istoric[istoric.length - 1].an);
        const diagnostic = calculeazaDiagnosticDinIstoric(istoric, piata);
        const interpretare = genereazaInterpretareDiagnostic(firmaRows[0], diagnostic, piata);

        res.json({
            sursa: 'publica',
            firma: { ...firmaRows[0], cod_caen: codCaen },
            an_analiza: diagnostic.an_analiza,
            istoric,
            piata,
            indicatori: diagnostic.indicatori,
            scoruri: diagnostic.scoruri,
            explicatii_scoruri: diagnostic.explicatii_scoruri,
            interpretare
        });
    } catch (err) {
        trimiteEroare(res, err, 'Eroare la generarea diagnosticului financiar.');
    }
});

/* FIRME UTILIZATOR */

app.post('/api/firma-utilizator', autentifica, async (req, res) => {
    try {
        const firma = valideazaFirmaUtilizator(req.body, req.utilizator.id_utilizator);

        await verificaUnicitateFirmaUtilizator(firma);

        const [result] = await sequelize.query(`
            INSERT INTO firme_utilizator
            (id_utilizator, denumire_firma, cui, cod_caen, judet, localitate, forma_juridica)
            VALUES (:id_utilizator, :denumire_firma, :cui, :cod_caen, :judet, :localitate, :forma_juridica)
            RETURNING id_firma
        `, {
            replacements: firma
        });

        res.json({
            id_firma: result[0].id_firma,
            mesaj: 'Firma a fost salvata in contul tau. Nu afecteaza statisticile oficiale.'
        });
    } catch (err) {
        trimiteEroare(res, err, 'Eroare la salvarea firmei.');
    }
});

app.get('/api/firme-utilizator', autentifica, async (req, res) => {
    try {
        const [results] = await sequelize.query(`
            SELECT
                fu.*,
                COUNT(dfu.id_date) AS ani_introdusi,
                MIN(dfu.an) AS primul_an,
                MAX(dfu.an) AS ultimul_an
            FROM firme_utilizator fu
            LEFT JOIN date_financiare_utilizator dfu
                ON fu.id_firma = dfu.id_firma
            WHERE fu.id_utilizator = :id_utilizator
            GROUP BY fu.id_firma
            ORDER BY fu.id_firma DESC
        `, {
            replacements: { id_utilizator: req.utilizator.id_utilizator }
        });

        res.json(results);
    } catch (err) {
        trimiteEroare(res, err, 'Eroare la citirea firmelor introduse.');
    }
});

app.delete('/api/firma-utilizator/:id_firma', autentifica, async (req, res) => {
    const id_firma = Number(req.params.id_firma);

    if (!Number.isInteger(id_firma) || id_firma <= 0) {
        return res.status(400).json({ mesaj: 'ID-ul firmei este invalid.' });
    }

    try {
        const firma = await verificaFirmaUtilizator(id_firma, req.utilizator.id_utilizator);

        if (!firma) {
            return res.status(404).json({ mesaj: 'Firma nu exista sau nu iti apartine.' });
        }

        await sequelize.query(`
            DELETE FROM firme_utilizator
            WHERE id_firma = :id_firma
              AND id_utilizator = :id_utilizator
        `, {
            replacements: {
                id_firma,
                id_utilizator: req.utilizator.id_utilizator
            }
        });

        res.json({ mesaj: 'Firma si datele financiare asociate au fost sterse.' });
    } catch (err) {
        trimiteEroare(res, err, 'Eroare la stergerea firmei.');
    }
});

app.get('/api/date-firma-utilizator', autentifica, async (req, res) => {
    const id_firma = req.query.id_firma;

    try {
        const firma = await verificaFirmaUtilizator(id_firma, req.utilizator.id_utilizator);

        if (!firma) {
            return res.status(404).json({ mesaj: 'Firma nu exista sau nu iti apartine.' });
        }

        const [results] = await sequelize.query(`
            SELECT *
            FROM date_financiare_utilizator
            WHERE id_firma = :id_firma
            ORDER BY an
        `, {
            replacements: { id_firma }
        });

        res.json(results);
    } catch (err) {
        trimiteEroare(res, err, 'Eroare la citirea datelor financiare.');
    }
});

app.post('/api/date-firma-utilizator', autentifica, async (req, res) => {
    try {
        const date = valideazaDateFinanciare(req.body);
        const firma = await verificaFirmaUtilizator(date.id_firma, req.utilizator.id_utilizator);

        if (!firma) {
            return res.status(404).json({ mesaj: 'Firma nu exista sau nu iti apartine.' });
        }

        const [existing] = await sequelize.query(`
            SELECT id_date
            FROM date_financiare_utilizator
            WHERE id_firma = :id_firma
              AND an = :an
            LIMIT 1
        `, {
            replacements: date
        });

        if (existing.length > 0) {
            await sequelize.query(`
                UPDATE date_financiare_utilizator
                SET
                    cifra_afaceri = :cifra_afaceri,
                    venituri_totale = :venituri_totale,
                    cheltuieli_totale = :cheltuieli_totale,
                    profit_net = :profit_net,
                    datorii = :datorii,
                    active_totale = :active_totale,
                    nr_angajati = :nr_angajati
                WHERE id_firma = :id_firma
                  AND an = :an
            `, {
                replacements: date
            });

            return res.json({ mesaj: 'Datele financiare pentru anul selectat au fost actualizate.' });
        }

        await sequelize.query(`
            INSERT INTO date_financiare_utilizator
            (id_firma, an, cifra_afaceri, venituri_totale, cheltuieli_totale, profit_net, datorii, active_totale, nr_angajati)
            VALUES (:id_firma, :an, :cifra_afaceri, :venituri_totale, :cheltuieli_totale, :profit_net, :datorii, :active_totale, :nr_angajati)
        `, {
            replacements: date
        });

        res.json({ mesaj: 'Datele financiare au fost salvate pentru analiza proprie.' });
    } catch (err) {
        trimiteEroare(res, err, 'Eroare la salvarea datelor financiare.');
    }
});

app.delete('/api/date-firma-utilizator/:id_date', autentifica, async (req, res) => {
    const id_date = Number(req.params.id_date);

    if (!Number.isInteger(id_date) || id_date <= 0) {
        return res.status(400).json({ mesaj: 'ID-ul randului financiar este invalid.' });
    }

    try {
        const [randuri] = await sequelize.query(`
            SELECT dfu.id_date, dfu.an
            FROM date_financiare_utilizator dfu
            JOIN firme_utilizator fu ON fu.id_firma = dfu.id_firma
            WHERE dfu.id_date = :id_date
              AND fu.id_utilizator = :id_utilizator
            LIMIT 1
        `, {
            replacements: {
                id_date,
                id_utilizator: req.utilizator.id_utilizator
            }
        });

        if (randuri.length === 0) {
            return res.status(404).json({ mesaj: 'Anul financiar nu exista sau nu iti apartine.' });
        }

        await sequelize.query(`
            DELETE FROM date_financiare_utilizator
            WHERE id_date = :id_date
        `, {
            replacements: { id_date }
        });

        res.json({ mesaj: `Datele financiare pentru anul ${randuri[0].an} au fost sterse.` });
    } catch (err) {
        trimiteEroare(res, err, 'Eroare la stergerea anului financiar.');
    }
});

app.get('/api/analiza-firma-utilizator', autentifica, async (req, res) => {
    const id_firma = req.query.id_firma;

    try {
        const firma = await verificaFirmaUtilizator(id_firma, req.utilizator.id_utilizator);

        if (!firma) {
            return res.status(404).json({ mesaj: 'Firma nu exista sau nu iti apartine.' });
        }

        const [results] = await sequelize.query(`
            SELECT
                an,
                cifra_afaceri,
                venituri_totale,
                cheltuieli_totale,
                profit_net,
                datorii,
                active_totale,
                nr_angajati,
                ROUND((profit_net / NULLIF(cifra_afaceri, 0)) * 100, 2) AS marja_profitului,
                ROUND((cheltuieli_totale / NULLIF(venituri_totale, 0)) * 100, 2) AS rata_cheltuielilor,
                ROUND((cifra_afaceri / NULLIF(nr_angajati, 0)), 2) AS productivitate_angajat,
                ROUND((datorii / NULLIF(active_totale, 0)) * 100, 2) AS grad_indatorare
            FROM date_financiare_utilizator
            WHERE id_firma = :id_firma
            ORDER BY an
        `, {
            replacements: { id_firma }
        });

        res.json(results);
    } catch (err) {
        trimiteEroare(res, err, 'Eroare la analiza firmei utilizatorului.');
    }
});

app.get('/api/diagnostic-firma-utilizator', autentifica, async (req, res) => {
    const id_firma = req.query.id_firma;

    try {
        const firma = await verificaFirmaUtilizator(id_firma, req.utilizator.id_utilizator);

        if (!firma) {
            return res.status(404).json({ mesaj: 'Firma nu exista sau nu iti apartine.' });
        }

        const [istoric] = await sequelize.query(`
            SELECT
                an,
                cifra_afaceri,
                venituri_totale,
                cheltuieli_totale,
                profit_net,
                datorii,
                active_totale,
                nr_angajati
            FROM date_financiare_utilizator
            WHERE id_firma = :id_firma
            ORDER BY an
        `, {
            replacements: { id_firma }
        });

        if (istoric.length === 0) {
            return res.status(404).json({ mesaj: 'Firma nu are date financiare introduse.' });
        }

        const piata = await obtinePiataCaen(firma.cod_caen, istoric[istoric.length - 1].an);
        const diagnostic = calculeazaDiagnosticDinIstoric(istoric, piata);
        const interpretare = genereazaInterpretareDiagnostic(firma, diagnostic, piata);

        res.json({
            sursa: 'utilizator',
            firma,
            an_analiza: diagnostic.an_analiza,
            istoric,
            piata,
            indicatori: diagnostic.indicatori,
            scoruri: diagnostic.scoruri,
            explicatii_scoruri: diagnostic.explicatii_scoruri,
            interpretare
        });
    } catch (err) {
        trimiteEroare(res, err, 'Eroare la diagnosticarea firmei utilizatorului.');
    }
});

app.get('/api/comparatie', autentifica, async (req, res) => {
    const id_firma = req.query.id_firma;

    try {
        const an = anRaport(req.query.an);
        const firmaUser = await verificaFirmaUtilizator(id_firma, req.utilizator.id_utilizator);

        if (!firmaUser) {
            return res.status(404).json({ mesaj: 'Firma nu exista sau nu iti apartine.' });
        }

        const [firma] = await sequelize.query(`
            SELECT fu.*, dfu.*
            FROM firme_utilizator fu
            JOIN date_financiare_utilizator dfu
                ON fu.id_firma = dfu.id_firma
            WHERE fu.id_firma = :id_firma
              AND fu.id_utilizator = :id_utilizator
              AND dfu.an = :an
            LIMIT 1
        `, {
            replacements: {
                id_firma,
                id_utilizator: req.utilizator.id_utilizator,
                an
            }
        });

        if (firma.length === 0) {
            return res.json({
                firma: null,
                piata: null,
                mesaj: 'Nu exista date financiare introduse pentru firma si anul selectat.'
            });
        }

        const firmaAnalizata = {
            ...firma[0],
            marja_profitului: rotunjeste(Number(firma[0].cifra_afaceri) ? (Number(firma[0].profit_net || 0) / Number(firma[0].cifra_afaceri)) * 100 : null),
            productivitate_angajat: rotunjeste(Number(firma[0].nr_angajati) ? Number(firma[0].cifra_afaceri || 0) / Number(firma[0].nr_angajati) : null),
            grad_indatorare: rotunjeste(Number(firma[0].active_totale) ? (Number(firma[0].datorii || 0) / Number(firma[0].active_totale)) * 100 : null)
        };

        const analizaCaen = await obtineComparatieCaenRapida(firmaAnalizata.cod_caen, an, firmaAnalizata);
        const piata = analizaCaen.piata;
        const top_caen = analizaCaen.top_caen;
        const pozitii_piata = analizaCaen.pozitii_piata;

        const indicatori_comparatie = [
            {
                key: 'cifra_afaceri',
                eticheta: 'Cifra de afaceri',
                firma: firmaAnalizata.cifra_afaceri,
                piata: piata?.medie_cifra_afaceri,
                procent: false,
                directie: 'mare'
            },
            {
                key: 'profit_net',
                eticheta: 'Profit net',
                firma: firmaAnalizata.profit_net,
                piata: piata?.medie_profit_net,
                procent: false,
                directie: 'mare'
            },
            {
                key: 'marja_profitului',
                eticheta: 'Marja profitului',
                firma: firmaAnalizata.marja_profitului,
                piata: piata?.medie_marja_profit,
                procent: true,
                directie: 'mare'
            },
            {
                key: 'productivitate_angajat',
                eticheta: 'Productivitate / angajat',
                firma: firmaAnalizata.productivitate_angajat,
                piata: piata?.medie_productivitate,
                procent: false,
                directie: 'mare'
            },
            {
                key: 'grad_indatorare',
                eticheta: 'Grad de indatorare',
                firma: firmaAnalizata.grad_indatorare,
                piata: piata?.medie_grad_indatorare,
                procent: true,
                directie: 'mica'
            }
        ].map(item => {
            const firmaVal = numar(item.firma);
            const piataVal = numar(item.piata);
            const diferenta = firmaVal !== null && piataVal !== null ? firmaVal - piataVal : null;
            const raport = firmaVal !== null && piataVal ? firmaVal / piataVal : null;
            let interpretare = 'Date insuficiente';
            let scor = 50;

            if (raport !== null && Number.isFinite(raport)) {
                const avantaj = item.directie === 'mica' ? 1 / raport : raport;
                scor = limiteazaScor(50 + (avantaj - 1) * 60);

                if (avantaj >= 1.1) interpretare = 'Peste medie';
                else if (avantaj >= 0.9) interpretare = 'Aproape de medie';
                else interpretare = 'Sub medie';
            }

            return {
                ...item,
                diferenta: rotunjeste(diferenta),
                pozitie: pozitii_piata[item.key] || null,
                scor,
                interpretare
            };
        });

        const scorCompetitiv = limiteazaScor(
            indicatori_comparatie.reduce((sum, item) => sum + item.scor, 0) / indicatori_comparatie.length
        );

        const concluzii_comparatie = indicatori_comparatie.map(item => {
            if (item.interpretare === 'Peste medie') {
                return `${item.eticheta}: firma este peste media CAEN, ceea ce indica un avantaj competitiv.`;
            }

            if (item.interpretare === 'Aproape de medie') {
                return `${item.eticheta}: firma este aproape de media pietei si trebuie monitorizata in timp.`;
            }

            if (item.interpretare === 'Sub medie') {
                return `${item.eticheta}: firma este sub media CAEN si necesita masuri de imbunatatire.`;
            }

            return `${item.eticheta}: nu exista suficiente date pentru comparatie.`;
        });

        res.json({
            firma: firmaAnalizata,
            piata,
            top_caen,
            pozitii_piata,
            pozitie_piata: pozitii_piata.cifra_afaceri || null,
            indicatori_comparatie,
            scor_competitiv: scorCompetitiv,
            concluzii_comparatie,
            mesaj: 'Comparatia foloseste firma introdusa in contul tau, media pietei si topul firmelor publice din acelasi cod CAEN.'
        });
    } catch (err) {
        trimiteEroare(res, err, 'Eroare la comparatie.');
    }
});

app.get('/api/previziune-firma-utilizator', autentifica, async (req, res) => {
    const id_firma = req.query.id_firma;

    try {
        const firma = await verificaFirmaUtilizator(id_firma, req.utilizator.id_utilizator);

        if (!firma) {
            return res.status(404).json({ mesaj: 'Firma nu exista sau nu iti apartine.' });
        }

        const [istoric] = await sequelize.query(`
            SELECT
                an,
                cifra_afaceri,
                profit_net,
                datorii,
                nr_angajati,
                active_totale
            FROM date_financiare_utilizator
            WHERE id_firma = :id_firma
            ORDER BY an
        `, {
            replacements: { id_firma }
        });

        if (istoric.length < 2) {
            return res.status(400).json({ mesaj: 'Previziunea necesita date financiare pentru cel putin doi ani.' });
        }

        const ultimulAn = istoric[istoric.length - 1];
        const anPrevizionat = Number(ultimulAn.an) + 1;

        function ritmMediu(key) {
            const ritmuri = [];

            for (let i = 1; i < istoric.length; i++) {
                const anterior = Number(istoric[i - 1][key]);
                const curent = Number(istoric[i][key]);

                if (Number.isFinite(anterior) && anterior !== 0 && Number.isFinite(curent)) {
                    ritmuri.push((curent - anterior) / Math.abs(anterior));
                }
            }

            if (!ritmuri.length) return 0;
            return ritmuri.reduce((sum, value) => sum + value, 0) / ritmuri.length;
        }

        function valoarePrevizionata(key, factorScenariu) {
            const baza = Number(ultimulAn[key]);
            if (!Number.isFinite(baza)) return null;
            return rotunjeste(baza * (1 + ritmMediu(key) * factorScenariu));
        }

        const scenarii = [
            { cheie: 'pesimist', eticheta: 'Pesimist', factor: 0.65 },
            { cheie: 'moderat', eticheta: 'Moderat', factor: 1 },
            { cheie: 'optimist', eticheta: 'Optimist', factor: 1.35 }
        ].map(scenariu => ({
            ...scenariu,
            an: anPrevizionat,
            cifra_afaceri: valoarePrevizionata('cifra_afaceri', scenariu.factor),
            profit_net: valoarePrevizionata('profit_net', scenariu.factor),
            datorii: valoarePrevizionata('datorii', scenariu.factor),
            nr_angajati: rotunjeste(valoarePrevizionata('nr_angajati', scenariu.factor), 0)
        }));

        const ritmuri = {
            cifra_afaceri: rotunjeste(ritmMediu('cifra_afaceri') * 100),
            profit_net: rotunjeste(ritmMediu('profit_net') * 100),
            datorii: rotunjeste(ritmMediu('datorii') * 100),
            nr_angajati: rotunjeste(ritmMediu('nr_angajati') * 100)
        };

        const moderat = scenarii.find(item => item.cheie === 'moderat');
        const interpretare = [];

        if ((ritmuri.cifra_afaceri || 0) > 0) {
            interpretare.push('Trendul cifrei de afaceri este pozitiv pe baza ritmului mediu anual.');
        } else {
            interpretare.push('Cifra de afaceri are un trend stagnat sau negativ si necesita atentie comerciala.');
        }

        if ((ritmuri.profit_net || 0) < 0) {
            interpretare.push('Profitul are tendinta de scadere, deci costurile si marjele trebuie analizate separat.');
        }

        if ((ritmuri.datorii || 0) > (ritmuri.cifra_afaceri || 0)) {
            interpretare.push('Datoriile cresc mai repede decat cifra de afaceri, ceea ce poate ridica riscul financiar.');
        }

        const categorieActuala = categorieImm(ultimulAn.cifra_afaceri, ultimulAn.nr_angajati);
        const categoriePrevizionata = categorieImm(moderat.cifra_afaceri, moderat.nr_angajati);

        if (categorieActuala !== categoriePrevizionata) {
            interpretare.push(`In scenariul moderat, firma poate trece de la ${categorieActuala} la ${categoriePrevizionata}.`);
        } else {
            interpretare.push(`In scenariul moderat, firma ramane in categoria ${categorieActuala}.`);
        }

        res.json({
            firma,
            metoda: 'Previziune pe ritm mediu anual de crestere, cu scenarii pesimist, moderat si optimist.',
            an_previzionat: anPrevizionat,
            istoric,
            ritmuri,
            scenarii,
            interpretare
        });
    } catch (err) {
        trimiteEroare(res, err, 'Eroare la calcularea previziunii.');
    }
});

/* TOPURI, DASHBOARD, CLASIFICARE, SECTOR */

app.get('/api/top-firme', async (req, res) => {
    const criteriu = req.query.criteriu || 'cifra_afaceri';
    const limit = nrPozitiv(req.query.limit, 10, 5, 100);
    const configuratie = criteriiTop[criteriu] || criteriiTop.cifra_afaceri;

    try {
        const an = anRaport(req.query.an);
        const [results] = await sequelize.query(`
            SELECT
                f.denumire_firma,
                f.cui,
                f.judet,
                f.localitate,
                f.forma_juridica,
                STRING_AGG(DISTINCT fc.cod_caen, ', ') AS coduri_caen,
                d.cifra_afaceri,
                d.profit_net,
                d.venituri_totale,
                d.cheltuieli_totale,
                d.datorii,
                d.active_imobilizate + d.active_circulante AS active_totale,
                d.nr_angajati,
                ROUND((d.profit_net / NULLIF(d.cifra_afaceri, 0)) * 100, 2) AS marja_profitului,
                ROUND((d.cifra_afaceri / NULLIF(d.nr_angajati, 0)), 2) AS productivitate_angajat,
                ROUND((d.datorii / NULLIF(d.active_imobilizate + d.active_circulante, 0)) * 100, 2) AS grad_indatorare,
                ROUND(${configuratie.coloana}, 2) AS valoare
            FROM date_financiare d
            JOIN firme f
                ON d.cui::BIGINT = f.cui
            LEFT JOIN firme_caen fc
                ON f.nr_inregistrare = fc.nr_inregistrare
            WHERE d.an = :an
              AND ${configuratie.coloana} IS NOT NULL
            GROUP BY
                f.denumire_firma,
                f.cui,
                f.judet,
                f.localitate,
                f.forma_juridica,
                d.cifra_afaceri,
                d.profit_net,
                d.venituri_totale,
                d.cheltuieli_totale,
                d.datorii,
                d.active_imobilizate,
                d.active_circulante,
                d.nr_angajati
            ORDER BY ${configuratie.coloana} DESC
            LIMIT :limit
        `, {
            replacements: { an, limit }
        });

        res.json({
            criteriu,
            eticheta: configuratie.eticheta,
            data: results
        });
    } catch (err) {
        trimiteEroare(res, err, 'Eroare la top firme.');
    }
});

app.get('/api/dashboard', async (req, res) => {
    const judet = text(req.query.judet);
    const cod_caen = text(req.query.cod_caen);
    const limit = nrPozitiv(req.query.limit, 10, 5, 50);
    const filtruJudet = judet ? 'AND f.judet ILIKE :judet' : '';
    const filtruCaen = cod_caen ? `
        AND EXISTS (
            SELECT 1
            FROM firme_caen fc_filtru
            WHERE fc_filtru.nr_inregistrare = f.nr_inregistrare
              AND fc_filtru.cod_caen ILIKE :cod_caen
        )
    ` : '';

    try {
        const an = anRaport(req.query.an);
        const replacements = {
            an,
            limit,
            judet: `%${judet}%`,
            cod_caen: `${cod_caen}%`
        };

        const [sumar] = await sequelize.query(`
            SELECT
                COUNT(DISTINCT f.cui) AS numar_firme,
                SUM(d.cifra_afaceri) AS cifra_afaceri_totala,
                SUM(d.profit_net) AS profit_total,
                AVG(d.cifra_afaceri) AS medie_cifra_afaceri,
                AVG(d.profit_net) AS medie_profit_net,
                AVG(d.nr_angajati) AS medie_angajati
            FROM date_financiare d
            JOIN firme f
                ON d.cui::BIGINT = f.cui
            WHERE d.an = :an
              ${filtruJudet}
              ${filtruCaen}
        `, { replacements });

        const [judete] = await sequelize.query(`
            SELECT
                f.judet,
                COUNT(DISTINCT f.cui) AS numar_firme,
                SUM(d.cifra_afaceri) AS cifra_afaceri_totala,
                SUM(d.profit_net) AS profit_total,
                AVG(d.cifra_afaceri) AS medie_cifra_afaceri
            FROM date_financiare d
            JOIN firme f
                ON d.cui::BIGINT = f.cui
            WHERE d.an = :an
              ${filtruJudet}
              ${filtruCaen}
            GROUP BY f.judet
            ORDER BY cifra_afaceri_totala DESC NULLS LAST
            LIMIT :limit
        `, { replacements });

        const [caen] = await sequelize.query(`
            SELECT
                fc.cod_caen,
                cc.denumire_caen,
                COUNT(DISTINCT f.cui) AS numar_firme,
                SUM(d.cifra_afaceri) AS cifra_afaceri_totala,
                SUM(d.profit_net) AS profit_total,
                AVG(d.profit_net) AS medie_profit_net
            FROM date_financiare d
            JOIN firme f
                ON d.cui::BIGINT = f.cui
            JOIN firme_caen fc
                ON f.nr_inregistrare = fc.nr_inregistrare
            LEFT JOIN coduri_caen cc
                ON fc.cod_caen = cc.cod_caen
            WHERE d.an = :an
              ${filtruJudet}
              ${filtruCaen}
            GROUP BY fc.cod_caen, cc.denumire_caen
            ORDER BY cifra_afaceri_totala DESC NULLS LAST
            LIMIT :limit
        `, { replacements });

        const [profitabilitate] = await sequelize.query(`
            SELECT
                f.judet,
                COUNT(DISTINCT f.cui) AS numar_firme,
                AVG((d.profit_net / NULLIF(d.cifra_afaceri, 0)) * 100) AS marja_medie
            FROM date_financiare d
            JOIN firme f
                ON d.cui::BIGINT = f.cui
            WHERE d.an = :an
              AND d.cifra_afaceri IS NOT NULL
              AND d.cifra_afaceri <> 0
              ${filtruJudet}
              ${filtruCaen}
            GROUP BY f.judet
            HAVING COUNT(DISTINCT f.cui) >= 5
            ORDER BY marja_medie DESC NULLS LAST
            LIMIT :limit
        `, { replacements });

        res.json({
            sumar: sumar[0],
            judete,
            caen,
            profitabilitate
        });
    } catch (err) {
        trimiteEroare(res, err, 'Eroare la dashboard.');
    }
});

app.get('/api/clasificare-imm', async (req, res) => {
    try {
        const an = anRaport(req.query.an);
        const [distributie] = await sequelize.query(`
            SELECT
                CASE
                    WHEN nr_angajati < 10 AND cifra_afaceri <= 2000000 THEN 'Microintreprindere'
                    WHEN nr_angajati < 50 AND cifra_afaceri <= 10000000 THEN 'Intreprindere mica'
                    WHEN nr_angajati < 250 AND cifra_afaceri <= 50000000 THEN 'Intreprindere mijlocie'
                    ELSE 'Intreprindere mare'
                END AS categorie,
                COUNT(*) AS numar_firme,
                AVG(cifra_afaceri) AS medie_cifra_afaceri,
                AVG(profit_net) AS medie_profit_net,
                AVG(nr_angajati) AS medie_angajati
            FROM date_financiare
            WHERE an = :an
              AND cifra_afaceri IS NOT NULL
              AND nr_angajati IS NOT NULL
            GROUP BY categorie
            ORDER BY numar_firme DESC
        `, {
            replacements: { an }
        });

        res.json({ distributie });
    } catch (err) {
        trimiteEroare(res, err, 'Eroare la clasificare IMM.');
    }
});

app.get('/api/clasificare-firma', async (req, res) => {
    const cifra_afaceri = Number(req.query.cifra_afaceri || 0);
    const nr_angajati = Number(req.query.nr_angajati || 0);

    if (!Number.isFinite(cifra_afaceri) || cifra_afaceri < 0 || !Number.isFinite(nr_angajati) || nr_angajati < 0) {
        return res.status(400).json({ mesaj: 'Completeaza valori numerice valide.' });
    }

    let categorie = 'Intreprindere mare';
    let explicatie = 'Depaseste pragurile pentru categoria IMM mijlocie.';

    if (nr_angajati < 10 && cifra_afaceri <= 2000000) {
        categorie = 'Microintreprindere';
        explicatie = 'Are sub 10 angajati si cifra de afaceri de maximum 2.000.000.';
    } else if (nr_angajati < 50 && cifra_afaceri <= 10000000) {
        categorie = 'Intreprindere mica';
        explicatie = 'Are sub 50 de angajati si cifra de afaceri de maximum 10.000.000.';
    } else if (nr_angajati < 250 && cifra_afaceri <= 50000000) {
        categorie = 'Intreprindere mijlocie';
        explicatie = 'Are sub 250 de angajati si cifra de afaceri de maximum 50.000.000.';
    }

    res.json({ categorie, explicatie });
});

app.get('/api/sector-caen', async (req, res) => {
    const cod_caen = text(req.query.cod_caen);
    const limit = nrPozitiv(req.query.limit, 10, 5, 50);
    const coduri = cod_caen
        .split(',')
        .map(item => item.trim())
        .filter(Boolean);
    const filtruCoduri = coduri.length
        ? 'AND fc.cod_caen IN (:coduri_caen)'
        : '';

    try {
        const an = anRaport(req.query.an);
        const [results] = await sequelize.query(`
            SELECT
                fc.cod_caen,
                cc.denumire_caen,
                COUNT(DISTINCT f.cui) AS numar_firme,
                SUM(d.cifra_afaceri) AS cifra_afaceri_totala,
                SUM(d.profit_net) AS profit_total,
                AVG(d.cifra_afaceri) AS medie_cifra_afaceri,
                AVG(d.profit_net) AS medie_profit_net,
                AVG(d.nr_angajati) AS medie_angajati,
                ROUND(AVG((d.profit_net / NULLIF(d.cifra_afaceri, 0)) * 100), 2) AS marja_medie,
                ROUND(AVG((d.datorii / NULLIF(d.active_imobilizate + d.active_circulante, 0)) * 100), 2) AS grad_indatorare_mediu,
                ROUND(AVG((d.cifra_afaceri / NULLIF(d.nr_angajati, 0))), 2) AS productivitate_medie
            FROM firme_caen fc
            JOIN firme f
                ON fc.nr_inregistrare = f.nr_inregistrare
            JOIN date_financiare d
                ON f.cui = d.cui::BIGINT
            LEFT JOIN coduri_caen cc
                ON fc.cod_caen = cc.cod_caen
            WHERE d.an = :an
              ${filtruCoduri}
            GROUP BY fc.cod_caen, cc.denumire_caen
            ORDER BY cifra_afaceri_totala DESC NULLS LAST
            LIMIT :limit
        `, {
            replacements: {
                coduri_caen: coduri,
                an,
                limit
            }
        });

        const sectorProfitabil = results
            .filter(row => row.marja_medie !== null)
            .sort((a, b) => Number(b.marja_medie) - Number(a.marja_medie))[0];
        const sectorRiscant = results
            .filter(row => row.grad_indatorare_mediu !== null)
            .sort((a, b) => Number(b.grad_indatorare_mediu) - Number(a.grad_indatorare_mediu))[0];
        const sectorVolum = results
            .filter(row => row.cifra_afaceri_totala !== null)
            .sort((a, b) => Number(b.cifra_afaceri_totala) - Number(a.cifra_afaceri_totala))[0];
        const sectorProductiv = results
            .filter(row => row.productivitate_medie !== null)
            .sort((a, b) => Number(b.productivitate_medie) - Number(a.productivitate_medie))[0];

        res.json({
            data: results,
            interpretare: {
                sector_profitabil: sectorProfitabil?.cod_caen || null,
                sector_riscant: sectorRiscant?.cod_caen || null,
                sector_volum: sectorVolum?.cod_caen || null,
                sector_productiv: sectorProductiv?.cod_caen || null
            }
        });
    } catch (err) {
        trimiteEroare(res, err, 'Eroare la analiza sectoriala.');
    }
});

/* START */

async function startServer() {
    try {
        await sequelize.authenticate();
        await pregatesteTabeleGestiune();
        await curataSesiuniLaPornire();
        await pregatesteIndexuriCautare();

        console.log('Conectat la baza de date');

        app.listen(PORT, () => {
            console.log(`Server pornit pe portul ${PORT}`);
        });
    } catch (err) {
        console.error('Eroare la pornirea serverului:', err);
    }
}

startServer();
