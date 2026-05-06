const express = require('express');
const cors = require('cors');
const path = require('path');
const sequelize = require('./config/db');

const app = express();

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

async function pregatesteTabeleGestiune() {
    await sequelize.query(`
        CREATE TABLE IF NOT EXISTS firme_utilizator (
            id_firma SERIAL PRIMARY KEY,
            denumire_firma TEXT NOT NULL,
            cui BIGINT,
            cod_caen VARCHAR(20),
            judet VARCHAR(100),
            localitate VARCHAR(150),
            forma_juridica VARCHAR(50)
        );
    `);

    await sequelize.query(`
        CREATE TABLE IF NOT EXISTS date_financiare_utilizator (
            id_date SERIAL PRIMARY KEY,
            id_firma INT REFERENCES firme_utilizator(id_firma),
            an INT NOT NULL,
            cifra_afaceri NUMERIC,
            venituri_totale NUMERIC,
            cheltuieli_totale NUMERIC,
            profit_net NUMERIC,
            datorii NUMERIC,
            active_totale NUMERIC,
            nr_angajati NUMERIC
        );
    `);
}

app.get('/api/firme', async (req, res) => {
    const search = (req.query.search || '').trim();

    if (search.length < 3) {
        return res.status(400).json({ mesaj: 'Introdu minim 3 caractere.' });
    }

    try {
        const [results] = await sequelize.query(`
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
            WHERE f.denumire_firma ILIKE :search
            ORDER BY f.denumire_firma
            LIMIT 100
        `, {
            replacements: { search: `${search}%` }
        });

        res.json(results);
    } catch (err) {
        console.error(err);
        res.status(500).json({ mesaj: 'Eroare la cautarea firmelor.' });
    }
});

app.get('/api/firme-financiare', async (req, res) => {
    const search = (req.query.search || '').trim();

    if (search.length < 3) {
        return res.status(400).json({ mesaj: 'Introdu minim 3 caractere.' });
    }

    try {
        const [results] = await sequelize.query(`
            SELECT DISTINCT
                f.denumire_firma,
                f.cui,
                f.judet,
                f.localitate,
                f.forma_juridica
            FROM firme f
            JOIN date_financiare d
                ON f.cui = d.cui::BIGINT
            WHERE f.denumire_firma ILIKE :search
              AND f.cui IS NOT NULL
              AND f.cui <> 0
            ORDER BY f.denumire_firma
            LIMIT 100
        `, {
            replacements: { search: `${search}%` }
        });

        res.json(results);
    } catch (err) {
        console.error(err);
        res.status(500).json({ mesaj: 'Eroare la cautarea firmelor financiare.' });
    }
});

app.get('/api/analiza-financiara', async (req, res) => {
    const cui = String(req.query.cui || '').trim();

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
                ROUND((datorii / NULLIF(active_imobilizate + active_circulante, 0)) * 100, 2) AS grad_indatorare
            FROM date_financiare
            WHERE TRIM(cui) = :cui
            ORDER BY an
        `, {
            replacements: { cui }
        });

        res.json(results);
    } catch (err) {
        console.error(err);
        res.status(500).json({ mesaj: 'Eroare la analiza financiara.' });
    }
});

app.post('/api/firma-utilizator', async (req, res) => {
    const firma = req.body;

    try {
        const [result] = await sequelize.query(`
            INSERT INTO firme_utilizator
            (denumire_firma, cui, cod_caen, judet, localitate, forma_juridica)
            VALUES (:denumire_firma, :cui, :cod_caen, :judet, :localitate, :forma_juridica)
            RETURNING id_firma
        `, {
            replacements: firma
        });

        res.json(result[0]);
    } catch (err) {
        console.error(err);
        res.status(500).json({ mesaj: 'Eroare la salvarea firmei.' });
    }
});

app.post('/api/date-firma-utilizator', async (req, res) => {
    const date = req.body;

    try {
        await sequelize.query(`
            INSERT INTO date_financiare_utilizator
            (id_firma, an, cifra_afaceri, venituri_totale, cheltuieli_totale, profit_net, datorii, active_totale, nr_angajati)
            VALUES (:id_firma, :an, :cifra_afaceri, :venituri_totale, :cheltuieli_totale, :profit_net, :datorii, :active_totale, :nr_angajati)
        `, {
            replacements: date
        });

        res.json({ mesaj: 'Date salvate.' });
    } catch (err) {
        console.error(err);
        res.status(500).json({ mesaj: 'Eroare la salvarea datelor financiare.' });
    }
});

app.get('/api/firme-utilizator', async (req, res) => {
    try {
        const [results] = await sequelize.query(`
            SELECT *
            FROM firme_utilizator
            ORDER BY id_firma DESC
        `);

        res.json(results);
    } catch (err) {
        console.error(err);
        res.status(500).json({ mesaj: 'Eroare la citirea firmelor introduse.' });
    }
});

app.get('/api/analiza-firma-utilizator', async (req, res) => {
    const id_firma = req.query.id_firma;

    try {
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
        console.error(err);
        res.status(500).json({ mesaj: 'Eroare la analiza firmei utilizatorului.' });
    }
});

app.get('/api/top-firme', async (req, res) => {
    const an = req.query.an || 2024;
    const criteriu = req.query.criteriu || 'cifra_afaceri';

    const coloane = {
        cifra_afaceri: 'd.cifra_afaceri',
        profit_net: 'd.profit_net',
        nr_angajati: 'd.nr_angajati'
    };

    const coloana = coloane[criteriu] || 'd.cifra_afaceri';

    try {
        const [results] = await sequelize.query(`
            SELECT
                f.denumire_firma,
                f.cui,
                f.judet,
                f.localitate,
                ${coloana} AS valoare
            FROM date_financiare d
            JOIN firme f
                ON d.cui::BIGINT = f.cui
            WHERE d.an = :an
              AND ${coloana} IS NOT NULL
            ORDER BY ${coloana} DESC
            LIMIT 50
        `, {
            replacements: { an }
        });

        res.json(results);
    } catch (err) {
        console.error(err);
        res.status(500).json({ mesaj: 'Eroare la top firme.' });
    }
});

app.get('/api/dashboard', async (req, res) => {
    try {
        const [judete] = await sequelize.query(`
            SELECT *
            FROM vedere_top_judete_dupa_performanta_2024
            ORDER BY cifra_afaceri_totala DESC
            LIMIT 10
        `);

        const [caen] = await sequelize.query(`
            SELECT *
            FROM top_caen_dupa_numar_firme
            LIMIT 10
        `);

        res.json({ judete, caen });
    } catch (err) {
        console.error(err);
        res.status(500).json({ mesaj: 'Eroare la dashboard.' });
    }
});

app.get('/api/clasificare-imm', async (req, res) => {
    const an = req.query.an || 2024;

    try {
        const [results] = await sequelize.query(`
            SELECT
                CASE
                    WHEN nr_angajati < 10 AND cifra_afaceri <= 2000000 THEN 'Microintreprindere'
                    WHEN nr_angajati < 50 AND cifra_afaceri <= 10000000 THEN 'Intreprindere mica'
                    WHEN nr_angajati < 250 AND cifra_afaceri <= 50000000 THEN 'Intreprindere mijlocie'
                    ELSE 'Intreprindere mare'
                END AS categorie,
                COUNT(*) AS numar_firme
            FROM date_financiare
            WHERE an = :an
              AND cifra_afaceri IS NOT NULL
              AND nr_angajati IS NOT NULL
            GROUP BY categorie
            ORDER BY numar_firme DESC
        `, {
            replacements: { an }
        });

        res.json(results);
    } catch (err) {
        console.error(err);
        res.status(500).json({ mesaj: 'Eroare la clasificare IMM.' });
    }
});

app.get('/api/sector-caen', async (req, res) => {
    const cod_caen = req.query.cod_caen || '6201';
    const an = req.query.an || 2024;

    try {
        const [results] = await sequelize.query(`
            SELECT
                fc.cod_caen,
                cc.denumire_caen,
                COUNT(DISTINCT f.cui) AS numar_firme,
                SUM(d.cifra_afaceri) AS cifra_afaceri_totala,
                SUM(d.profit_net) AS profit_total
            FROM firme_caen fc
            JOIN firme f
                ON fc.nr_inregistrare = f.nr_inregistrare
            JOIN date_financiare d
                ON f.cui = d.cui::BIGINT
            LEFT JOIN coduri_caen cc
                ON fc.cod_caen = cc.cod_caen
            WHERE fc.cod_caen = :cod_caen
              AND d.an = :an
            GROUP BY fc.cod_caen, cc.denumire_caen
        `, {
            replacements: { cod_caen, an }
        });

        res.json(results);
    } catch (err) {
        console.error(err);
        res.status(500).json({ mesaj: 'Eroare la analiza sectoriala.' });
    }
});

app.get('/api/comparatie', async (req, res) => {
    const id_firma = req.query.id_firma;
    const an = req.query.an || 2024;

    try {
        const [firma] = await sequelize.query(`
            SELECT fu.*, dfu.*
            FROM firme_utilizator fu
            JOIN date_financiare_utilizator dfu
                ON fu.id_firma = dfu.id_firma
            WHERE fu.id_firma = :id_firma
              AND dfu.an = :an
            LIMIT 1
        `, {
            replacements: { id_firma, an }
        });

        if (firma.length === 0) {
            return res.json({ firma: null, piata: null });
        }

        const cod_caen = firma[0].cod_caen;

        const [piata] = await sequelize.query(`
            SELECT
                AVG(d.cifra_afaceri) AS medie_cifra_afaceri,
                AVG(d.profit_net) AS medie_profit_net,
                AVG(d.nr_angajati) AS medie_angajati
            FROM date_financiare d
            JOIN firme f
                ON d.cui::BIGINT = f.cui
            JOIN firme_caen fc
                ON f.nr_inregistrare = fc.nr_inregistrare
            WHERE d.an = :an
              AND fc.cod_caen = :cod_caen
        `, {
            replacements: { an, cod_caen }
        });

        res.json({ firma: firma[0], piata: piata[0] });
    } catch (err) {
        console.error(err);
        res.status(500).json({ mesaj: 'Eroare la comparatie.' });
    }
});

async function startServer() {
    try {
        await sequelize.authenticate();
        await pregatesteTabeleGestiune();

        console.log('Conectat la baza de date');
        app.listen(5000, () => {
            console.log('Server pornit pe portul 5000');
        });
    } catch (err) {
        console.error('Eroare la pornirea serverului:', err);
    }
}

startServer();