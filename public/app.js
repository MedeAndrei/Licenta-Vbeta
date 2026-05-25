const state = {
    firmePage: 1,
    firmeHasNext: false,
    analizaPage: 1,
    analizaTotalPages: 1,
    firmaSelectataId: null,
    firmeUtilizator: [],
    token: sessionStorage.getItem('imm_token') || '',
    utilizator: JSON.parse(sessionStorage.getItem('imm_user') || 'null'),
    raport: []
};

const ANI_RAPORTARE = [2024, 2023, 2022, 2021, 2020, 2019, 2018, 2017, 2016];

document.addEventListener('DOMContentLoaded', () => {
    initAniRaportare();
    initNavigatie();
    initEvenimente();
    actualizeazaZonaAutentificare();

    if (state.token) {
        verificaSesiune();
    }
});

/* INITIALIZARE */

function initAniRaportare() {
    document.querySelectorAll('.year-select').forEach(select => {
        select.innerHTML = ANI_RAPORTARE.map(an => `
            <option value="${an}"${an === 2024 ? ' selected' : ''}>${an}</option>
        `).join('');
    });
}

function initNavigatie() {
    document.querySelectorAll('.nav').forEach(button => {
        button.addEventListener('click', () => {
            arataPagina(button.dataset.page, button);
            ruleazaIncarcarePagina(button.dataset.load);
        });
    });
}

function initEvenimente() {
    on('btnRegister', 'click', register);
    on('btnLogin', 'click', login);
    on('btnLogout', 'click', logout);

    on('btnCautaFirme', 'click', () => cautaFirme(1));
    on('btnFirmeInapoi', 'click', () => schimbaPaginaFirme(-1));
    on('btnFirmeInainte', 'click', () => schimbaPaginaFirme(1));
    onEnter('cautareText', () => cautaFirme(1));

    on('btnCautaAnaliza', 'click', () => cautaFirmeFinanciare(1));
    on('btnAnalizaInapoi', 'click', () => schimbaPaginaAnaliza(-1));
    on('btnAnalizaInainte', 'click', () => schimbaPaginaAnaliza(1));
    onEnter('analizaText', () => cautaFirmeFinanciare(1));

    on('btnSalveazaFirma', 'click', salveazaFirma);
    on('btnSalveazaDate', 'click', salveazaDateFinanciare);
    on('btnDiagnosticFirmaMea', 'click', deschideDiagnosticFirmaMea);
    on('btnFirmaMeaDiagnostic', 'click', deschideDiagnosticFirmaMea);
    on('btnFirmaMeaComparatie', 'click', deschideComparatieFirmaMea);
    on('btnFirmaMeaPreviziune', 'click', deschidePreviziuneFirmaMea);

    on('btnDiagnostic', 'click', genereazaDiagnostic);
    onEnter('diagnosticCui', genereazaDiagnostic);

    on('btnComparaFirma', 'click', comparaFirma);
    on('btnPreviziune', 'click', incarcaPreviziune);
    on('btnIncarcaTop', 'click', incarcaTop);
    on('btnIncarcaSector', 'click', incarcaSector);
    on('btnDashboard', 'click', incarcaDashboard);
    on('btnClasificare', 'click', incarcaClasificare);
    on('btnClasificaFirma', 'click', clasificaFirma);

    on('btnActualizeazaRaport', 'click', actualizeazaRaport);
    on('btnRaportFirma', 'click', genereazaRaportFirma);
    on('btnExportCsv', 'click', exportCsv);
    on('btnExportPdf', 'click', () => window.print());
}

function on(id, event, handler) {
    document.querySelectorAll(`[id="${id}"]`).forEach(element => {
        element.addEventListener(event, handler);
    });
}

function onEnter(id, handler) {
    on(id, 'keydown', event => {
        if (event.key === 'Enter') handler();
    });
}

function ruleazaIncarcarePagina(load) {
    if (load === 'firme-utilizator') incarcaFirmeUtilizator();
    if (load === 'dashboard') incarcaDashboard();
    if (load === 'clasificare') incarcaClasificare();
    if (load === 'raport') {
        incarcaFirmeUtilizator();
        actualizeazaRaport();
    }
}

function arataPagina(id, buton) {
    const pagina = document.getElementById(id);
    if (!pagina) return;

    document.querySelectorAll('.pagina').forEach(item => item.classList.remove('activa'));
    pagina.classList.add('activa');

    document.querySelectorAll('.nav').forEach(nav => nav.classList.remove('active'));
    if (buton) buton.classList.add('active');
}

function deschidePagina(id) {
    const nav = document.querySelector(`.nav[data-page="${id}"]`);
    arataPagina(id, nav);
}

function deschideDiagnosticFirmaMea() {
    deschidePagina('diagnostic');
    genereazaDiagnosticFirmaUtilizator();
}

function deschideComparatieFirmaMea() {
    if (state.firmaSelectataId) setValue('firmaComparatie', state.firmaSelectataId);
    deschidePagina('comparatii');
    comparaFirma();
}

function deschidePreviziuneFirmaMea() {
    if (state.firmaSelectataId) setValue('firmaPreviziune', state.firmaSelectataId);
    deschidePagina('previziune');
    incarcaPreviziune();
}

/* API SI AUTENTIFICARE */

function headersJson() {
    const headers = { 'Content-Type': 'application/json' };

    if (state.token) {
        headers.Authorization = `Bearer ${state.token}`;
    }

    return headers;
}

async function api(url, options = {}) {
    const response = await fetch(url, {
        ...options,
        headers: {
            ...headersJson(),
            ...(options.headers || {})
        }
    });

    const text = await response.text();
    const data = text ? JSON.parse(text) : {};

    if (!response.ok) {
        throw new Error(data.mesaj || 'Eroare la incarcare.');
    }

    return data;
}

function cereAutentificare() {
    if (!state.token) {
        throw new Error('Trebuie sa fii autentificat pentru aceasta actiune.');
    }
}

async function verificaSesiune() {
    try {
        const data = await api('/api/me');
        state.utilizator = data.utilizator;
        sessionStorage.setItem('imm_user', JSON.stringify(data.utilizator));
        actualizeazaZonaAutentificare();
    } catch (err) {
        state.token = '';
        state.utilizator = null;
        sessionStorage.removeItem('imm_token');
        sessionStorage.removeItem('imm_user');
        actualizeazaZonaAutentificare();
    }
}

async function register() {
    const payload = {
        nume: val('authNume'),
        email: val('authEmail').toLowerCase(),
        parola: val('authParola')
    };

    if (!payload.nume) return mesajAuth('Numele este obligatoriu.');
    if (!emailValid(payload.email)) return mesajAuth('Email invalid. Trebuie sa contina @ si punct.');
    if (!parolaValida(payload.parola)) {
        return mesajAuth('Parola trebuie sa aiba minim 6 caractere si sa nu fie formata doar din cifre.');
    }

    try {
        const data = await api('/api/register', {
            method: 'POST',
            body: JSON.stringify(payload)
        });

        mesajAuth(data.mesaj || 'Cont creat. Te poti autentifica.');
    } catch (err) {
        mesajAuth(err.message);
    }
}

async function login() {
    const payload = {
        email: val('authEmail').toLowerCase(),
        parola: val('authParola')
    };

    if (!emailValid(payload.email)) return mesajAuth('Email invalid.');
    if (!payload.parola) return mesajAuth('Parola este obligatorie.');

    try {
        const data = await api('/api/login', {
            method: 'POST',
            body: JSON.stringify(payload)
        });

        state.token = data.token;
        state.utilizator = data.utilizator;

        sessionStorage.setItem('imm_token', data.token);
        sessionStorage.setItem('imm_user', JSON.stringify(data.utilizator));

        actualizeazaZonaAutentificare();
        mesajAuth(`Autentificat ca ${data.utilizator.nume}.`);
        incarcaFirmeUtilizator();
    } catch (err) {
        mesajAuth(err.message);
    }
}

async function logout() {
    try {
        if (state.token) {
            await api('/api/logout', { method: 'POST' });
        }
    } catch (err) {
        console.warn(err.message);
    }

    state.token = '';
    state.utilizator = null;
    state.firmaSelectataId = null;
    state.firmeUtilizator = [];

    sessionStorage.removeItem('imm_token');
    sessionStorage.removeItem('imm_user');

    actualizeazaZonaAutentificare();
    curataZonaFirmaMea();
    mesajAuth('Te-ai delogat.');
}

function actualizeazaZonaAutentificare() {
    const info = document.getElementById('authInfo');
    const card = document.querySelector('.auth-card');
    if (!info) return;

    if (state.utilizator) {
        if (card) card.classList.add('logged-in');

        info.innerHTML = `
            <strong>${esc(state.utilizator.nume)}</strong>
            <span>${esc(state.utilizator.email)}</span>
        `;
    } else {
        if (card) card.classList.remove('logged-in');

        info.innerHTML = `
            <strong>Neautentificat</strong>
            <span>Autentifica-te pentru Firma mea.</span>
        `;
    }
}

function mesajAuth(mesaj) {
    setText('authMesaj', mesaj);
}

/* CAUTARE FIRME */

async function cautaFirme(page) {
    const search = val('cautareText');
    const criteriu = val('criteriuCautare');
    const limit = val('limitCautare');
    const tabel = document.getElementById('tabelFirme');

    if (search.length < 2) {
        tabel.innerHTML = randMesaj(8, 'Introdu minim 2 caractere.');
        return;
    }

    tabel.innerHTML = randMesaj(8, 'Se cauta...');
    state.firmePage = page;

    try {
        const data = await api(`/api/firme?search=${encodeURIComponent(search)}&criteriu=${criteriu}&page=${page}&limit=${limit}`);

        state.firmeHasNext = Boolean(data.hasNext);
        setText('paginaFirme', data.hasNext ? `Pagina ${data.page} | exista rezultate urmatoare` : `Pagina ${data.page} | ultima pagina`);

        renderTabelFirmeDetaliat(data.data);
        document.querySelector('#cautare .page-title')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
        adaugaRaport('Cautare firme', data.data);
    } catch (err) {
        tabel.innerHTML = randMesaj(8, err.message);
    }
}

function renderTabelFirmeDetaliat(rows) {
    const head = document.getElementById('headTabelFirme');
    const body = document.getElementById('tabelFirme');

    if (!rows || rows.length === 0) {
        head.innerHTML = `
            <tr>
                <th>Denumire</th>
                <th>CUI</th>
                <th>Nr. inregistrare</th>
                <th>Judet</th>
                <th>Localitate</th>
                <th>Forma</th>
                <th>Stare</th>
                <th>CAEN</th>
            </tr>
        `;
        body.innerHTML = randMesaj(8, 'Nu exista rezultate.');
        return;
    }

    const ordinePreferata = [
        'denumire_firma',
        'cui',
        'nr_inregistrare',
        'euid',
        'judet',
        'localitate',
        'adresa',
        'forma_juridica',
        'cod_stare',
        'coduri_caen',
        'denumiri_caen',
        'data_inregistrare',
        'data_radiere',
        'email',
        'website'
    ];

    const etichete = {
        denumire_firma: 'Denumire',
        cui: 'CUI',
        nr_inregistrare: 'Nr. inregistrare',
        euid: 'EUID',
        judet: 'Judet',
        localitate: 'Localitate',
        adresa: 'Adresa',
        forma_juridica: 'Forma juridica',
        cod_stare: 'Stare',
        coduri_caen: 'Coduri CAEN',
        denumiri_caen: 'Denumiri CAEN',
        data_inregistrare: 'Data inregistrare',
        data_radiere: 'Data radiere',
        email: 'Email',
        website: 'Website'
    };

    const toateColoanele = Object.keys(rows[0]).filter(col => !['createdAt', 'updatedAt'].includes(col));
    const coloane = [
        ...ordinePreferata.filter(col => toateColoanele.includes(col)),
        ...toateColoanele.filter(col => !ordinePreferata.includes(col))
    ];

    head.innerHTML = `<tr>${coloane.map(col => `<th class="${clasaColoana(col)}">${esc(etichete[col] || transformaNumeColoana(col))}</th>`).join('')}</tr>`;

    body.innerHTML = rows.map(row => `
        <tr>${coloane.map(col => `<td class="${clasaColoana(col)}">${formateazaCelula(row[col], col)}</td>`).join('')}</tr>
    `).join('');
}

function formateazaCelula(value, col) {
    if (value === null || value === undefined || value === '') return '';
    if (col === 'cod_stare') return `<span class="pill">${esc(value)}</span>`;
    return esc(value);
}

function clasaColoana(col) {
    if (col === 'denumire_firma') return 'col-denumire';
    if (col === 'denumiri_caen') return 'col-caen-wide';
    if (col === 'coduri_caen') return 'col-caen-code';
    return '';
}

function schimbaPaginaFirme(delta) {
    const next = state.firmePage + delta;

    if (next < 1) return;
    if (delta > 0 && !state.firmeHasNext) return;

    cautaFirme(next);
}

/* ANALIZA FINANCIARA */

async function cautaFirmeFinanciare(page) {
    const search = val('analizaText');
    const criteriu = val('criteriuAnaliza');
    const limit = val('limitAnaliza');
    const tabel = document.getElementById('tabelFirmeFinanciare');

    if (search.length < 2) {
        tabel.innerHTML = randMesaj(6, 'Introdu minim 2 caractere.');
        return;
    }

    tabel.innerHTML = randMesaj(6, 'Se cauta...');
    state.analizaPage = page;

    try {
        const data = await api(`/api/firme-financiare?search=${encodeURIComponent(search)}&criteriu=${criteriu}&page=${page}&limit=${limit}`);

        state.analizaTotalPages = data.totalPages || 1;
        setText('paginaAnaliza', `Pagina ${data.page} din ${state.analizaTotalPages} | ${data.total || 0} rezultate`);

        tabel.innerHTML = data.data.map(firma => `
            <tr data-cui="${esc(firma.cui)}">
                <td>${esc(firma.denumire_firma)}</td>
                <td>${esc(firma.cui)}</td>
                <td>${esc(firma.judet)}</td>
                <td>${esc(firma.localitate)}</td>
                <td>${esc(firma.coduri_caen)}</td>
                <td>${esc(firma.primul_an)} - ${esc(firma.ultimul_an)}</td>
            </tr>
        `).join('') || randMesaj(6, 'Nu exista rezultate.');

        document.querySelector('#analiza .page-title')?.scrollIntoView({ behavior: 'smooth', block: 'start' });

        document.querySelectorAll('#tabelFirmeFinanciare tr[data-cui]').forEach(row => {
            row.addEventListener('click', () => incarcaAnaliza(row.dataset.cui));
        });
    } catch (err) {
        tabel.innerHTML = randMesaj(6, err.message);
    }
}

function schimbaPaginaAnaliza(delta) {
    const next = state.analizaPage + delta;
    if (next >= 1 && next <= state.analizaTotalPages) {
        cautaFirmeFinanciare(next);
    }
}

async function incarcaAnaliza(cui) {
    const tabel = document.getElementById('tabelAnaliza');
    tabel.innerHTML = randMesaj(8, 'Se incarca analiza...');

    try {
        const data = await api(`/api/analiza-financiara?cui=${encodeURIComponent(cui)}`);

        tabel.innerHTML = data.map(row => `
            <tr>
                <td>${esc(row.an)}</td>
                <td>${numar(row.cifra_afaceri)}</td>
                <td>${numar(row.profit_net)}</td>
                <td>${numar(row.nr_angajati)}</td>
                <td>${procent(row.marja_profitului)}</td>
                <td>${numar(row.productivitate_angajat)}</td>
                <td>${procent(row.grad_indatorare)}</td>
                <td>${procent(row.evolutie_cifra_afaceri)}</td>
            </tr>
        `).join('') || randMesaj(8, 'Nu exista date financiare.');

        renderAnalizaCharts('graficAnaliza', data);
        renderConcluziiAnaliza(data);
        adaugaRaport('Analiza financiara', data);
    } catch (err) {
        tabel.innerHTML = randMesaj(8, err.message);
        setText('concluziiAnaliza', err.message);
    }
}

function renderConcluziiAnaliza(data) {
    if (!data || data.length < 2) {
        setHtml('concluziiAnaliza', '<p>Nu exista suficiente date pentru concluzii automate.</p>');
        return;
    }

    const ultimul = data[data.length - 1];
    const penultim = data[data.length - 2];
    const concluzii = [];

    const evolutieCa = valoareNumerica(ultimul.evolutie_cifra_afaceri);
    const evolutieProfit = evolutieProcentuala(penultim.profit_net, ultimul.profit_net);
    const evolutieDatorii = evolutieProcentuala(penultim.datorii, ultimul.datorii);

    if (evolutieCa > 5) concluzii.push('Cifra de afaceri este in crestere, ceea ce indica extinderea activitatii comerciale.');
    else if (evolutieCa < -5) concluzii.push('Cifra de afaceri este in scadere si necesita analiza portofoliului de clienti sau a vanzarilor.');
    else concluzii.push('Cifra de afaceri este relativ stabila fata de anul anterior.');

    if (evolutieProfit < evolutieCa - 5) {
        concluzii.push('Profitul creste mai lent decat cifra de afaceri sau scade, semn ca presiunea costurilor trebuie monitorizata.');
    } else if (evolutieProfit > evolutieCa + 5) {
        concluzii.push('Profitul evolueaza mai bine decat veniturile, ceea ce sugereaza o eficienta operationala mai buna.');
    }

    if (evolutieDatorii > evolutieCa + 10) {
        concluzii.push('Datoriile cresc mai repede decat cifra de afaceri, ceea ce poate creste riscul financiar.');
    }

    if (valoareNumerica(ultimul.productivitate_angajat) > valoareNumerica(penultim.productivitate_angajat)) {
        concluzii.push('Productivitatea pe angajat s-a imbunatatit fata de anul anterior.');
    } else {
        concluzii.push('Productivitatea pe angajat nu s-a imbunatatit si merita urmarita in analiza interna.');
    }

    setHtml('concluziiAnaliza', `
        <h4>Concluzii automate</h4>
        <ul>${concluzii.map(item => `<li>${esc(item)}</li>`).join('')}</ul>
    `);
}

/* FIRMA MEA */

async function salveazaFirma() {
    try {
        cereAutentificare();

        const firma = valideazaFirmaFormular();

        const data = await api('/api/firma-utilizator', {
            method: 'POST',
            body: JSON.stringify(firma)
        });

        setText('mesajFirma', data.mesaj || 'Firma salvata.');

        if (data.id_firma) {
            state.firmaSelectataId = data.id_firma;
            setValue('idFirmaDate', data.id_firma);
        }

        await incarcaFirmeUtilizator();

        if (data.id_firma && state.firmeUtilizator.length) {
            selecteazaFirmaUtilizator(data.id_firma, state.firmeUtilizator);
        }
    } catch (err) {
        setText('mesajFirma', err.message);
    }
}

function valideazaFirmaFormular() {
    const denumire = val('denumireFirma');
    const cui = val('cuiFirma');
    const codCaen = val('caenFirma');

    if (denumire.length < 2) {
        throw new Error('Denumirea firmei este obligatorie si trebuie sa aiba minim 2 caractere.');
    }

    if (!/^\d{2,10}$/.test(cui)) {
        throw new Error('CUI invalid. Introdu doar cifre, intre 2 si 10 caractere.');
    }

    if (codCaen && !/^\d{4}$/.test(codCaen)) {
        throw new Error('Codul CAEN trebuie sa contina 4 cifre.');
    }

    return {
        denumire_firma: denumire,
        cui: Number(cui),
        cod_caen: codCaen,
        judet: val('judetFirma'),
        localitate: val('localitateFirma'),
        forma_juridica: val('formaFirma')
    };
}

async function salveazaDateFinanciare() {
    try {
        cereAutentificare();

        const date = valideazaDateFinanciareFormular();

        const data = await api('/api/date-firma-utilizator', {
            method: 'POST',
            body: JSON.stringify(date)
        });

        setText('mesajDate', data.mesaj || 'Date salvate.');
        state.firmaSelectataId = date.id_firma;

        await incarcaFirmeUtilizator();
        await incarcaDateFirmaUtilizator(date.id_firma);
    } catch (err) {
        setText('mesajDate', err.message);
    }
}

function valideazaDateFinanciareFormular() {
    const an = Number(val('anDate'));

    if (!Number.isInteger(an) || an < 1990 || an > 2100) {
        throw new Error('Anul trebuie sa fie valid, intre 1990 si 2100.');
    }

    const nrAngajati = numarPozitivSauZero('angajatiDate', 'Numar angajati');

    if (!Number.isInteger(nrAngajati)) {
        throw new Error('Numarul de angajati trebuie sa fie intreg.');
    }

    const profit = Number(val('profitDate'));
    if (!Number.isFinite(profit)) {
        throw new Error('Profitul net trebuie sa fie numeric.');
    }

    return {
        id_firma: numarPozitivSauZero('idFirmaDate', 'ID firma'),
        an,
        cifra_afaceri: numarPozitivSauZero('cifraDate', 'Cifra de afaceri'),
        venituri_totale: numarPozitivSauZero('venituriDate', 'Venituri totale'),
        cheltuieli_totale: numarPozitivSauZero('cheltuieliDate', 'Cheltuieli totale'),
        profit_net: profit,
        datorii: numarPozitivSauZero('datoriiDate', 'Datorii'),
        active_totale: numarPozitivSauZero('activeDate', 'Active totale'),
        nr_angajati: nrAngajati
    };
}

async function incarcaFirmeUtilizator() {
    const tabel = document.getElementById('tabelFirmeUtilizator');
    const selecturiFirma = document.querySelectorAll('#firmaComparatie, #firmaPreviziune, #firmaRaport');

    if (!tabel && !selecturiFirma.length) return;

    try {
        cereAutentificare();

        const data = await api('/api/firme-utilizator');
        state.firmeUtilizator = data;

        if (tabel) {
            tabel.innerHTML = data.map(firma => `
                <tr data-id="${esc(firma.id_firma)}">
                    <td>${esc(firma.id_firma)}</td>
                    <td>${esc(firma.denumire_firma)}</td>
                    <td>${esc(firma.cui)}</td>
                    <td>${esc(firma.cod_caen)}</td>
                    <td>${esc(firma.localitate)}</td>
                    <td>${esc(firma.ani_introdusi)} (${esc(firma.primul_an || '-')}-${esc(firma.ultimul_an || '-')})</td>
                </tr>
            `).join('') || randMesaj(6, 'Nu ai firme introduse.');

            document.querySelectorAll('#tabelFirmeUtilizator tr[data-id]').forEach(row => {
                row.addEventListener('click', () => selecteazaFirmaUtilizator(row.dataset.id, data));
            });
        }

        selecturiFirma.forEach(select => {
            select.innerHTML = data.map(firma => `
                <option value="${esc(firma.id_firma)}">${esc(firma.denumire_firma)} | CAEN ${esc(firma.cod_caen || '-')}</option>
            `).join('') || '<option value="">Nu exista firme introduse</option>';
        });
    } catch (err) {
        if (tabel) tabel.innerHTML = randMesaj(6, err.message);
        selecturiFirma.forEach(select => {
            select.innerHTML = `<option value="">${esc(err.message)}</option>`;
        });
    }
}

function selecteazaFirmaUtilizator(id, firme = state.firmeUtilizator) {
    const firma = firme.find(item => String(item.id_firma) === String(id));
    if (!firma) return;

    state.firmaSelectataId = firma.id_firma;

    setValue('idFirmaDate', firma.id_firma);
    setText('firmaSelectataText', `${firma.denumire_firma} | ID ${firma.id_firma} | CAEN ${firma.cod_caen || '-'}`);

    const selectComparatie = document.getElementById('firmaComparatie');
    if (selectComparatie) selectComparatie.value = firma.id_firma;

    const selectPreviziune = document.getElementById('firmaPreviziune');
    if (selectPreviziune) selectPreviziune.value = firma.id_firma;

    const selectRaport = document.getElementById('firmaRaport');
    if (selectRaport) selectRaport.value = firma.id_firma;

    incarcaDateFirmaUtilizator(firma.id_firma);
}

async function incarcaDateFirmaUtilizator(idFirma) {
    const tabel = document.getElementById('tabelDateFirmaUtilizator');
    if (!tabel || !idFirma) return;

    try {
        const data = await api(`/api/date-firma-utilizator?id_firma=${encodeURIComponent(idFirma)}`);

        tabel.innerHTML = data.map(row => `
            <tr>
                <td>${esc(row.an)}</td>
                <td>${numar(row.cifra_afaceri)}</td>
                <td>${numar(row.venituri_totale)}</td>
                <td>${numar(row.cheltuieli_totale)}</td>
                <td>${numar(row.profit_net)}</td>
                <td>${numar(row.datorii)}</td>
                <td>${numar(row.active_totale)}</td>
                <td>${numar(row.nr_angajati)}</td>
            </tr>
        `).join('') || randMesaj(8, 'Nu exista ani introdusi pentru firma selectata.');

        renderFirmaMeaCharts('graficFirmaMea', data);
        renderFirmaMeaKpi(data);
    } catch (err) {
        tabel.innerHTML = randMesaj(8, err.message);
    }
}

function renderFirmaMeaKpi(data) {
    if (!data || !data.length) {
        setHtml('firmaMeaKpi', '');
        return;
    }

    const ultimul = data[data.length - 1];
    const penultim = data.length > 1 ? data[data.length - 2] : null;
    const evolutieCa = penultim && valoareNumerica(penultim.cifra_afaceri)
        ? ((valoareNumerica(ultimul.cifra_afaceri) - valoareNumerica(penultim.cifra_afaceri)) / Math.abs(valoareNumerica(penultim.cifra_afaceri))) * 100
        : null;

    setHtml('firmaMeaKpi', `
        <div class="kpi"><strong>${esc(ultimul.an)}</strong><span>Ultimul an introdus</span></div>
        <div class="kpi"><strong>${numar(ultimul.cifra_afaceri)}</strong><span>Cifra de afaceri</span></div>
        <div class="kpi"><strong>${numar(ultimul.profit_net)}</strong><span>Profit net</span></div>
        <div class="kpi"><strong>${categorieImmClient(ultimul.cifra_afaceri, ultimul.nr_angajati)}</strong><span>Incadrare IMM</span></div>
        <div class="kpi"><strong>${evolutieCa === null ? '-' : procent(evolutieCa)}</strong><span>Evolutie CA fata de anul anterior</span></div>
    `);
}

function curataZonaFirmaMea() {
    setValue('idFirmaDate', '');
    setText('firmaSelectataText', 'Nu este selectata nicio firma.');

    const tabelFirme = document.getElementById('tabelFirmeUtilizator');
    const tabelDate = document.getElementById('tabelDateFirmaUtilizator');

    if (tabelFirme) tabelFirme.innerHTML = randMesaj(6, 'Autentifica-te pentru a vedea firmele tale.');
    if (tabelDate) tabelDate.innerHTML = randMesaj(8, 'Selecteaza o firma pentru a vedea istoricul financiar.');

    setHtml('graficFirmaMea', '');
    setHtml('firmaMeaKpi', '');
}

/* COMPARATII */

async function comparaFirma() {
    const id = val('firmaComparatie') || state.firmaSelectataId;
    const an = anRaportare('anComparatie');
    const tabel = document.getElementById('tabelComparatie');

    if (!id) {
        tabel.innerHTML = randMesaj(4, 'Selecteaza o firma.');
        return;
    }

    try {
        cereAutentificare();

        const data = await api(`/api/comparatie?id_firma=${encodeURIComponent(id)}&an=${encodeURIComponent(an)}`);

        if (!data.firma) {
            tabel.innerHTML = randMesaj(4, data.mesaj || 'Nu exista date.');
            setHtml('kpiComparatie', '');
            setHtml('graficComparatie', '');
            setHtml('graficTopComparatie', '');
            setHtml('tabelTopComparatie', randMesaj(7, 'Ruleaza comparatia pentru a vedea topul CAEN.'));
            setHtml('tabelPozitiiComparatie', randMesaj(4, 'Nu exista pozitii calculate.'));
            setHtml('tabelConcluziiComparatie', randMesaj(3, 'Nu exista concluzii.'));
            return;
        }

        const piata = data.piata || {};
        const indicatori = data.indicatori_comparatie || [];
        const rows = indicatori.map(item => [
            item.eticheta,
            item.firma,
            item.piata,
            item.procent,
            item.interpretare
        ]);

        tabel.innerHTML = indicatori.map(item => {
            const diferenta = valoareNumerica(item.firma) - valoareNumerica(item.piata);

            return `
                <tr>
                    <td>${esc(item.eticheta)}</td>
                    <td>${item.procent ? procent(item.firma) : numar(item.firma)}</td>
                    <td>${item.procent ? procent(item.piata) : numar(item.piata)}</td>
                    <td>${item.procent ? procent(diferenta) : numar(diferenta)}</td>
                </tr>
            `;
        }).join('');

        setHtml('kpiComparatie', `
            <div class="kpi"><strong>${numar(piata.numar_firme_piata)}</strong><span>Firme in piata</span></div>
            <div class="kpi"><strong>${esc(data.firma.cod_caen || '-')}</strong><span>Cod CAEN</span></div>
            <div class="kpi"><strong>${esc(data.scor_competitiv || '-')}</strong><span>Scor competitiv / 100</span></div>
            <div class="kpi"><strong>${data.pozitie_piata ? '#' + numar(data.pozitie_piata) : calculeazaPozitionare(rows)}</strong><span>Pozitie dupa cifra de afaceri</span></div>
            <div class="kpi"><strong>${categorieImmClient(data.firma.cifra_afaceri, data.firma.nr_angajati)}</strong><span>Clasificare IMM</span></div>
        `);

        renderPozitiiComparatie(indicatori, piata.numar_firme_piata);
        renderConcluziiComparatie(indicatori, data.concluzii_comparatie || []);
        renderComparatieCharts('graficComparatie', rows);
        renderTopComparatie(data.top_caen || []);
        adaugaRaport('Comparatie firma', indicatori);
    } catch (err) {
        tabel.innerHTML = randMesaj(4, err.message);
    }
}

function renderPozitiiComparatie(indicatori, totalPiata) {
    setHtml('tabelPozitiiComparatie', indicatori.map(item => `
        <tr>
            <td>${esc(item.eticheta)}</td>
            <td>${item.pozitie ? '#' + numar(item.pozitie) : '-'}</td>
            <td>${numar(totalPiata)}</td>
            <td><span class="status-badge ${clasaStatus(item.interpretare)}">${esc(item.interpretare)}</span></td>
        </tr>
    `).join('') || randMesaj(4, 'Nu exista pozitii calculate.'));
}

function renderConcluziiComparatie(indicatori, concluzii) {
    const recomandari = indicatori.map(item => {
        if (item.interpretare === 'Peste medie') return 'Mentine avantajul si urmareste evolutia concurentilor din top.';
        if (item.interpretare === 'Aproape de medie') return 'Optimizeaza gradual indicatorul pentru a trece peste media sectorului.';
        if (item.interpretare === 'Sub medie') return 'Analizeaza cauzele si stabileste masuri concrete de imbunatatire.';
        return 'Completeaza datele financiare pentru o evaluare mai clara.';
    });

    setHtml('tabelConcluziiComparatie', indicatori.map((item, index) => `
        <tr>
            <td>${esc(item.eticheta)}</td>
            <td>${esc(concluzii[index] || item.interpretare)}</td>
            <td>${esc(recomandari[index])}</td>
        </tr>
    `).join('') || randMesaj(3, 'Nu exista concluzii.'));
}

function renderTopComparatie(rows) {
    const tabel = document.getElementById('tabelTopComparatie');
    if (!tabel) return;

    tabel.innerHTML = rows.map(row => `
        <tr>
            <td>${esc(row.pozitie)}</td>
            <td>${esc(row.denumire_firma)}</td>
            <td>${esc(row.cui)}</td>
            <td>${esc(row.judet)}</td>
            <td>${numar(row.cifra_afaceri)}</td>
            <td>${numar(row.profit_net)}</td>
            <td>${procent(row.marja_profitului)}</td>
        </tr>
    `).join('') || randMesaj(7, 'Nu exista top disponibil pentru codul CAEN selectat.');

    setHtml('graficTopComparatie', barChart(rows, 'denumire_firma', 'cifra_afaceri', 'Top firme CAEN dupa cifra de afaceri', '#1d4ed8'));
}

function calculeazaPozitionare(rows) {
    const scoruri = rows.map(row => {
        const firma = valoareNumerica(row[1]);
        const piata = valoareNumerica(row[2]);
        if (!firma || !piata) return null;

        if (row[0] === 'Grad indatorare') return firma <= piata ? 1 : 0;
        return firma >= piata ? 1 : 0;
    }).filter(value => value !== null);

    if (!scoruri.length) return '-';

    const procentaj = scoruri.reduce((sum, value) => sum + value, 0) / scoruri.length;

    if (procentaj >= 0.75) return 'Peste medie';
    if (procentaj >= 0.45) return 'Aproape de medie';
    return 'Sub medie';
}

/* PREVIZIUNE */

async function incarcaPreviziune() {
    const id = val('firmaPreviziune') || state.firmaSelectataId;
    const tabel = document.getElementById('tabelPreviziune');

    if (!id) {
        tabel.innerHTML = randMesaj(5, 'Selecteaza o firma din contul tau.');
        return;
    }

    try {
        cereAutentificare();

        const data = await api(`/api/previziune-firma-utilizator?id_firma=${encodeURIComponent(id)}`);

        setHtml('previziuneKpi', `
            <div class="kpi"><strong>${esc(data.an_previzionat)}</strong><span>An previzionat</span></div>
            <div class="kpi"><strong>${procent(data.ritmuri.cifra_afaceri)}</strong><span>Ritm mediu CA</span></div>
            <div class="kpi"><strong>${procent(data.ritmuri.profit_net)}</strong><span>Ritm mediu profit</span></div>
            <div class="kpi"><strong>${procent(data.ritmuri.datorii)}</strong><span>Ritm mediu datorii</span></div>
        `);

        tabel.innerHTML = data.scenarii.map(row => `
            <tr>
                <td>${esc(row.eticheta)}</td>
                <td>${esc(row.an)}</td>
                <td>${numar(row.cifra_afaceri)}</td>
                <td>${numar(row.profit_net)}</td>
                <td>${numar(row.datorii)}</td>
                <td>${numar(row.nr_angajati)}</td>
            </tr>
        `).join('') || randMesaj(6, 'Nu exista scenarii calculate.');

        setHtml('previziuneInterpretare', `
            <h4>${esc(data.firma.denumire_firma)}</h4>
            <p><strong>${esc(data.metoda)}</strong></p>
            <ul>${data.interpretare.map(item => `<li>${esc(item)}</li>`).join('')}</ul>
        `);

        renderPreviziuneCharts('graficPreviziune', data);
        adaugaRaport('Previziune financiara', data.scenarii);
    } catch (err) {
        tabel.innerHTML = randMesaj(6, err.message);
        setHtml('previziuneKpi', '');
        setText('previziuneInterpretare', err.message);
    }
}

/* TOP, SECTOR, DASHBOARD, CLASIFICARE */

async function incarcaTop() {
    const criteriu = val('criteriuTop');
    const an = anRaportare('anTop');
    const limit = val('limitTop');

    try {
        const data = await api(`/api/top-firme?criteriu=${criteriu}&an=${an}&limit=${limit}`);

        setText('coloanaTop', data.eticheta);

        setHtml('tabelTop', data.data.map((row, index) => `
            <tr>
                <td>${esc(row.pozitie || index + 1)}</td>
                <td>${esc(row.denumire_firma)}</td>
                <td>${esc(row.cui)}</td>
                <td>${esc(row.judet)}</td>
                <td>${esc(row.localitate)}</td>
                <td class="col-caen-code">${esc(row.coduri_caen)}</td>
                <td>${numar(row.valoare)}</td>
                <td>${numar(row.profit_net)}</td>
                <td>${numar(row.nr_angajati)}</td>
            </tr>
        `).join('') || randMesaj(9, 'Nu exista date.'));

        setHtml('graficTop', `
            ${barChart(data.data.slice(0, 10), 'denumire_firma', 'valoare', data.eticheta, '#1d4ed8')}
            ${barChart(data.data.slice(0, 10), 'denumire_firma', 'profit_net', 'Profit net in top', '#15803d')}
        `);
        adaugaRaport('Top firme', data.data);
    } catch (err) {
        setHtml('tabelTop', randMesaj(9, err.message));
    }
}

async function incarcaSector() {
    const cod = val('codCaenSector');
    const an = anRaportare('anSector');
    const limit = val('limitSector');

    try {
        const response = await api(`/api/sector-caen?cod_caen=${encodeURIComponent(cod)}&an=${an}&limit=${limit}`);
        const data = Array.isArray(response) ? response : response.data;
        const interpretare = Array.isArray(response) ? {} : response.interpretare;

        const totalFirme = data.reduce((sum, row) => sum + valoareNumerica(row.numar_firme), 0);
        const totalCifra = data.reduce((sum, row) => sum + valoareNumerica(row.cifra_afaceri_totala), 0);
        const totalProfit = data.reduce((sum, row) => sum + valoareNumerica(row.profit_total), 0);

        setHtml('sectorKpi', `
            <div class="kpi"><strong>${numar(data.length)}</strong><span>Sectoare analizate</span></div>
            <div class="kpi"><strong>${numar(totalFirme)}</strong><span>Firme incluse</span></div>
            <div class="kpi"><strong>${numar(totalCifra)}</strong><span>Cifra afaceri cumulata</span></div>
            <div class="kpi"><strong>${numar(totalProfit)}</strong><span>Profit cumulat</span></div>
        `);

        setHtml('tabelSector', data.map(row => `
            <tr>
                <td>${esc(row.cod_caen)}</td>
                <td>${esc(row.denumire_caen)}</td>
                <td>${numar(row.numar_firme)}</td>
                <td>${numar(row.cifra_afaceri_totala)}</td>
                <td>${numar(row.profit_total)}</td>
                <td>${numar(row.medie_cifra_afaceri)}</td>
                <td>${numar(row.medie_profit_net)}</td>
                <td>${procent(row.marja_medie)}</td>
                <td>${procent(row.grad_indatorare_mediu)}</td>
                <td>${numar(row.productivitate_medie)}</td>
            </tr>
        `).join('') || randMesaj(10, 'Nu exista date.'));

        renderSectorCharts('graficSector', data);
        renderSectorInterpretare(interpretare);
        adaugaRaport('Analiza sectoriala', data);
    } catch (err) {
        setHtml('tabelSector', randMesaj(10, err.message));
        setHtml('sectorKpi', '');
        setText('sectorInterpretare', err.message);
    }
}

async function incarcaDashboard() {
    const an = anRaportare('anDashboard');
    const judet = val('judetDashboard');
    const caen = val('caenDashboard');
    const limit = val('limitDashboard') || '10';

    setText('dashboardAnCurent', an);

    try {
        const data = await api(`/api/dashboard?an=${an}&judet=${encodeURIComponent(judet)}&cod_caen=${encodeURIComponent(caen)}&limit=${limit}`);

        setHtml('dashboardKpi', `
            <div class="kpi"><strong>${numar(data.sumar.numar_firme)}</strong><span>Firme analizate</span></div>
            <div class="kpi"><strong>${numar(data.sumar.cifra_afaceri_totala)}</strong><span>Cifra afaceri totala</span></div>
            <div class="kpi"><strong>${numar(data.sumar.profit_total)}</strong><span>Profit total</span></div>
            <div class="kpi"><strong>${numar(data.sumar.medie_angajati)}</strong><span>Medie angajati</span></div>
        `);

        setHtml('tabelDashboardJudete', data.judete.map(row => `
            <tr>
                <td>${esc(row.judet)}</td>
                <td>${numar(row.numar_firme)}</td>
                <td>${numar(row.cifra_afaceri_totala)}</td>
                <td>${numar(row.profit_total)}</td>
            </tr>
        `).join(''));

        setHtml('tabelDashboardCaen', data.caen.map(row => `
            <tr>
                <td>${esc(row.cod_caen)}</td>
                <td>${esc(row.denumire_caen)}</td>
                <td>${numar(row.numar_firme)}</td>
                <td>${numar(row.cifra_afaceri_totala)}</td>
            </tr>
        `).join(''));

        setHtml('tabelProfitabilitate', data.profitabilitate.map(row => `
            <tr>
                <td>${esc(row.judet)}</td>
                <td>${numar(row.numar_firme)}</td>
                <td>${procent(row.marja_medie)}</td>
            </tr>
        `).join(''));

        renderBars('graficJudete', data.judete, 'judet', 'cifra_afaceri_totala', 'Top judete dupa cifra de afaceri');
        renderBars('graficCaen', data.caen, 'cod_caen', 'cifra_afaceri_totala', 'Top CAEN dupa cifra de afaceri');
        adaugaRaport('Dashboard', data.judete);
    } catch (err) {
        setHtml('dashboardKpi', `<div class="kpi"><strong>Eroare</strong><span>${esc(err.message)}</span></div>`);
    }
}

async function incarcaClasificare() {
    const an = anRaportare('anClasificare');

    try {
        const data = await api(`/api/clasificare-imm?an=${an}`);

        setHtml('tabelClasificare', data.distributie.map(row => `
            <tr>
                <td>${esc(row.categorie)}</td>
                <td>${numar(row.numar_firme)}</td>
                <td>${numar(row.medie_cifra_afaceri)}</td>
                <td>${numar(row.medie_profit_net)}</td>
                <td>${numar(row.medie_angajati)}</td>
            </tr>
        `).join('') || randMesaj(5, 'Nu exista date.'));

        renderClasificareCharts('graficClasificare', data.distributie);
        adaugaRaport('Clasificare IMM', data.distributie);
    } catch (err) {
        setHtml('tabelClasificare', randMesaj(5, err.message));
    }
}

async function clasificaFirma() {
    const cifra = val('clasifCifra');
    const angajati = val('clasifAngajati');

    try {
        const data = await api(`/api/clasificare-firma?cifra_afaceri=${cifra}&nr_angajati=${angajati}`);

        setHtml('rezultatClasificare', `
            <strong>${esc(data.categorie)}</strong>
            <span>${esc(data.explicatie)}</span>
        `);
    } catch (err) {
        setText('rezultatClasificare', err.message);
    }
}

/* DIAGNOSTIC */

async function genereazaDiagnostic() {
    const cui = val('diagnosticCui');

    if (!cui) {
        setHtml('tabelDiagnosticIndicatori', randMesaj(5, 'Introdu CUI-ul firmei.'));
        return;
    }

    try {
        const data = await api(`/api/diagnostic-financiar?cui=${encodeURIComponent(cui)}`);
        renderDiagnostic(data);
    } catch (err) {
        setHtml('tabelDiagnosticIndicatori', randMesaj(5, err.message));
        setText('diagnosticInterpretare', err.message);
    }
}

async function genereazaDiagnosticFirmaUtilizator() {
    const id = state.firmaSelectataId || val('firmaComparatie') || val('idFirmaDate');

    if (!id) {
        setHtml('tabelDiagnosticIndicatori', randMesaj(5, 'Selecteaza o firma din contul tau.'));
        return;
    }

    try {
        cereAutentificare();

        const data = await api(`/api/diagnostic-firma-utilizator?id_firma=${encodeURIComponent(id)}`);
        renderDiagnostic(data);
    } catch (err) {
        setHtml('tabelDiagnosticIndicatori', randMesaj(5, err.message));
        setText('diagnosticInterpretare', err.message);
    }
}

function renderDiagnostic(data) {
    const categorieImm = categorieImmClient(data.indicatori.cifra_afaceri, data.indicatori.nr_angajati);

    setHtml('diagnosticScoruri', `
        <div class="kpi"><strong>${data.scoruri.general}/100</strong><span>Scor general (${esc(data.scoruri.categorie)})</span></div>
        <div class="kpi"><strong>${data.scoruri.profitabilitate}/100</strong><span>Profitabilitate</span></div>
        <div class="kpi"><strong>${data.scoruri.eficienta}/100</strong><span>Eficienta</span></div>
        <div class="kpi"><strong>${data.scoruri.risc}/100</strong><span>Stabilitate / risc</span></div>
        <div class="kpi"><strong>${esc(categorieImm)}</strong><span>Clasificare IMM</span></div>
    `);

    const indicatori = [
        indicatorDiagnostic('An analiza', data.an_analiza, null, 'neutral', 'Anul pentru care este calculat diagnosticul.'),
        indicatorDiagnostic('Cifra de afaceri', data.indicatori.cifra_afaceri, data.piata?.medie_cifra_afaceri, 'mare', 'Masoara volumul activitatii comerciale.'),
        indicatorDiagnostic('Profit net', data.indicatori.profit_net, data.piata?.medie_profit_net, 'mare', 'Arata rezultatul final dupa venituri si cheltuieli.'),
        indicatorDiagnostic('Marja profitului', data.indicatori.marja_profitului, data.piata?.medie_marja_profit, 'mare', 'Arata cat profit ramane din cifra de afaceri.', true),
        indicatorDiagnostic('Rata cheltuielilor', data.indicatori.rata_cheltuielilor, data.piata?.medie_rata_cheltuieli, 'mica', 'Arata ponderea cheltuielilor in venituri.', true),
        indicatorDiagnostic('Productivitate / angajat', data.indicatori.productivitate_angajat, data.piata?.medie_productivitate, 'mare', 'Arata cifra de afaceri generata de un angajat.'),
        indicatorDiagnostic('Grad de indatorare', data.indicatori.grad_indatorare, data.piata?.medie_grad_indatorare, 'mica', 'Arata presiunea datoriilor in raport cu activele.', true),
        indicatorDiagnostic('Rentabilitate active', data.indicatori.rentabilitate_active, null, 'mare', 'Arata cat profit genereaza activele firmei.', true),
        indicatorDiagnostic('Evolutie cifra de afaceri', data.indicatori.evolutie_cifra_afaceri, null, 'mare', 'Compara cifra de afaceri cu anul anterior.', true),
        indicatorDiagnostic('Evolutie profit', data.indicatori.evolutie_profit, null, 'mare', 'Compara profitul net cu anul anterior.', true)
    ];

    setHtml('tabelDiagnosticIndicatori', indicatori.map(row => `
        <tr>
            <td>${esc(row.nume)}</td>
            <td>${row.procent ? procent(row.valoare) : row.formatat}</td>
            <td>${row.medie === null || row.medie === undefined ? '-' : (row.procent ? procent(row.medie) : numar(row.medie))}</td>
            <td><span class="status-badge ${row.clasa}">${esc(row.status)}</span></td>
            <td>${esc(row.explicatie)}</td>
        </tr>
    `).join(''));

    const explicatii = data.explicatii_scoruri || {};

    setHtml('diagnosticInterpretare', `
        <h4>${esc(data.firma.denumire_firma)} - ${esc(data.firma.cui || data.firma.id_firma)}</h4>
        <p><strong>${esc(data.interpretare.concluzie_generala)}</strong></p>

        <h4>Metodologia scorului</h4>
        <p>Scor general = 35% profitabilitate + 25% eficienta + 20% risc + 20% crestere.</p>

        <h4>Explicarea scorurilor</h4>
        <ul>
            <li>${esc(explicatii.profitabilitate || 'Profitabilitatea este calculata pe baza profitului si marjei.')}</li>
            <li>${esc(explicatii.eficienta || 'Eficienta este calculata pe baza costurilor si productivitatii.')}</li>
            <li>${esc(explicatii.risc || 'Riscul este calculat pe baza indatorarii si stabilitatii financiare.')}</li>
            <li>${esc(explicatii.crestere || 'Cresterea este calculata pe baza evolutiei fata de anul anterior.')}</li>
        </ul>

        <h4>Concluzii</h4>
        <ul>${data.interpretare.concluzii.map(item => `<li>${esc(item)}</li>`).join('')}</ul>

        <h4>Puncte forte</h4>
        <ul>${data.interpretare.puncte_forte.map(item => `<li>${esc(item)}</li>`).join('')}</ul>

        <h4>Riscuri</h4>
        <ul>${data.interpretare.riscuri.map(item => `<li>${esc(item)}</li>`).join('')}</ul>

        <h4>Recomandari</h4>
        <ul>${data.interpretare.recomandari.map(item => `<li>${esc(item)}</li>`).join('')}</ul>
    `);

    renderDiagnosticCharts('graficDiagnostic', data);

    adaugaRaport('Diagnostic financiar', [{
        sursa: data.sursa,
        firma: data.firma.denumire_firma,
        cui: data.firma.cui || '',
        an_analiza: data.an_analiza,
        scor_general: data.scoruri.general,
        categorie: data.scoruri.categorie,
        categorie_imm: categorieImm,
        concluzie: data.interpretare.concluzie_generala
    }]);
}

function indicatorDiagnostic(nume, valoare, medie, directie, explicatie, procentual = false) {
    const v = valoareNumerica(valoare);
    const m = medie === null || medie === undefined ? null : valoareNumerica(medie);
    let status = 'Informativ';
    let clasa = 'neutral';

    if (directie !== 'neutral' && valoare !== null && valoare !== undefined && valoare !== '') {
        if (m !== null && m !== 0) {
            const avantaj = directie === 'mica' ? m / v : v / m;
            if (avantaj >= 1.1) {
                status = 'Bun';
                clasa = 'good';
            } else if (avantaj >= 0.9) {
                status = 'Atentie';
                clasa = 'watch';
            } else {
                status = 'Risc';
                clasa = 'risk';
            }
        } else if ((directie === 'mare' && v > 0) || (directie === 'mica' && v < 50)) {
            status = 'Bun';
            clasa = 'good';
        } else {
            status = 'Atentie';
            clasa = 'watch';
        }
    }

    return {
        nume,
        valoare,
        medie,
        procent: procentual,
        formatat: nume.startsWith('An') ? esc(valoare) : (procentual ? procent(valoare) : numar(valoare)),
        status,
        clasa,
        explicatie
    };
}

/* GRAFICE */

function renderAnalizaCharts(id, data) {
    setHtml(id, `
        ${lineChart(data, [
            { key: 'cifra_afaceri', label: 'Cifra de afaceri', color: '#1d4ed8' },
            { key: 'profit_net', label: 'Profit net', color: '#15803d' },
            { key: 'datorii', label: 'Datorii', color: '#b45309' }
        ], 'Evolutie cifra de afaceri, profit si datorii')}
        ${lineChart(data, [
            { key: 'marja_profitului', label: 'Marja profitului', color: '#0f766e' },
            { key: 'grad_indatorare', label: 'Grad indatorare', color: '#b91c1c' },
            { key: 'rata_cheltuielilor', label: 'Rata cheltuielilor', color: '#7c3aed' }
        ], 'Evolutie indicatori procentuali')}
        ${barChart(data, 'an', 'productivitate_angajat', 'Productivitate pe angajat', '#0f766e')}
    `);
}

function renderFirmaMeaCharts(id, data) {
    setHtml(id, `
        ${lineChart(data, [
            { key: 'cifra_afaceri', label: 'Cifra de afaceri', color: '#1d4ed8' },
            { key: 'profit_net', label: 'Profit net', color: '#15803d' },
            { key: 'datorii', label: 'Datorii', color: '#b45309' }
        ], 'Evolutie firma selectata')}
        ${barChart(data, 'an', 'nr_angajati', 'Evolutie numar angajati', '#0f766e')}
    `);
}

function renderComparatieCharts(id, rows) {
    setHtml(id, groupedBarChart(rows, 'Comparatie firma vs media pietei'));
}

function renderSectorCharts(id, data) {
    setHtml(id, `
        ${pieChart(data.slice(0, 8), 'cod_caen', 'numar_firme', 'Pondere firme pe coduri CAEN')}
        ${barChart(data, 'cod_caen', 'profit_total', 'Profit total pe sector CAEN', '#15803d')}
        ${barChart(data, 'cod_caen', 'marja_medie', 'Marja medie pe sector (%)', '#0f766e', true)}
        ${barChart(data, 'cod_caen', 'productivitate_medie', 'Productivitate medie pe sector', '#1d4ed8')}
    `);
}

function renderClasificareCharts(id, data) {
    setHtml(id, `
        ${pieChart(data, 'categorie', 'numar_firme', 'Distributie firme pe categorii IMM')}
        ${barChart(data, 'categorie', 'medie_cifra_afaceri', 'Cifra de afaceri medie pe categorie', '#1d4ed8')}
    `);
}

function renderSectorInterpretare(interpretare = {}) {
    setHtml('sectorInterpretare', `
        <h4>Interpretare sectoriala</h4>
        <ul>
            <li>Sector cu volum mai mare: ${esc(interpretare.sector_volum || '-')}.</li>
            <li>Sector mai profitabil dupa marja medie: ${esc(interpretare.sector_profitabil || '-')}.</li>
            <li>Sector cu risc mai mare dupa gradul de indatorare: ${esc(interpretare.sector_riscant || '-')}.</li>
            <li>Sector cu productivitate mai buna: ${esc(interpretare.sector_productiv || '-')}.</li>
        </ul>
    `);
}

function renderDiagnosticCharts(id, data) {
    const scoruri = [
        { label: 'Profitabilitate', value: data.scoruri.profitabilitate },
        { label: 'Eficienta', value: data.scoruri.eficienta },
        { label: 'Risc', value: data.scoruri.risc },
        { label: 'Crestere', value: data.scoruri.crestere }
    ];

    setHtml(id, `
        ${barChart(scoruri, 'label', 'value', 'Scoruri diagnostic', '#1d4ed8')}
        ${lineChart(data.istoric, [
            { key: 'cifra_afaceri', label: 'Cifra de afaceri', color: '#1d4ed8' },
            { key: 'profit_net', label: 'Profit net', color: '#15803d' },
            { key: 'datorii', label: 'Datorii', color: '#b45309' }
        ], 'Evolutie financiara')}
    `);
}

function renderPreviziuneCharts(id, data) {
    const scenariuModerat = data.scenarii.find(item => item.cheie === 'moderat');
    const istoricPlusPreviziune = [
        ...data.istoric.map(row => ({ ...row, label: row.an })),
        {
            ...scenariuModerat,
            label: `${data.an_previzionat} prev.`
        }
    ];

    setHtml(id, `
        ${lineChart(istoricPlusPreviziune, [
            { key: 'cifra_afaceri', label: 'Cifra de afaceri', color: '#1d4ed8' },
            { key: 'profit_net', label: 'Profit net', color: '#15803d' },
            { key: 'datorii', label: 'Datorii', color: '#b91c1c' }
        ], 'Istoric si previziune moderata')}
        ${barChart(data.scenarii, 'eticheta', 'cifra_afaceri', 'Scenarii cifra de afaceri', '#1d4ed8')}
        ${barChart(data.scenarii, 'eticheta', 'profit_net', 'Scenarii profit net', '#15803d')}
    `);
}

function renderBars(id, data, labelKey, valueKey, title) {
    setHtml(id, barChart(data, labelKey, valueKey, title, '#1d4ed8'));
}

function barChart(data, labelKey, valueKey, title, color = '#1d4ed8', percent = false) {
    if (!data || !data.length) return chartEmpty(title);

    const values = data.map(row => Math.abs(valoareNumerica(row[valueKey])));
    const max = Math.max(...values, 1);

    return `
        <div class="chart-block">
            <h4>${esc(title)}</h4>
            ${data.map(row => {
                const raw = valoareNumerica(row[valueKey]);
                const width = Math.max(3, Math.abs(raw) / max * 100);

                return `
                    <div class="bar-row">
                        <span>${esc(String(row[labelKey] || '').slice(0, 34))}</span>
                        <div class="bar-track">
                            <div class="bar-fill" style="width:${width}%; background:${color}"></div>
                        </div>
                        <b>${percent ? procent(raw) : numar(raw)}</b>
                    </div>
                `;
            }).join('')}
        </div>
    `;
}

function lineChart(data, series, title) {
    if (!data || data.length < 2) return chartEmpty(title);

    const width = 760;
    const height = 260;
    const padding = 38;
    const allValues = data.flatMap(row => series.map(item => valoareNumerica(row[item.key])));
    const min = Math.min(...allValues, 0);
    const max = Math.max(...allValues, 1);
    const range = max - min || 1;

    function x(index) {
        return padding + (index / Math.max(data.length - 1, 1)) * (width - padding * 2);
    }

    function y(value) {
        return height - padding - ((value - min) / range) * (height - padding * 2);
    }

    const lines = series.map(item => {
        const points = data.map((row, index) => `${x(index)},${y(valoareNumerica(row[item.key]))}`).join(' ');

        return `
            <polyline points="${points}" fill="none" stroke="${item.color}" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"></polyline>
            ${data.map((row, index) => `
                <circle cx="${x(index)}" cy="${y(valoareNumerica(row[item.key]))}" r="4" fill="${item.color}"></circle>
            `).join('')}
        `;
    }).join('');

    const labels = data.map((row, index) => `
        <text x="${x(index)}" y="${height - 10}" text-anchor="middle" font-size="11" fill="#64748b">${esc(row.an || row.label || '')}</text>
    `).join('');

    const legend = series.map(item => `
        <span><i style="background:${item.color}"></i>${esc(item.label)}</span>
    `).join('');

    return `
        <div class="chart-block">
            <h4>${esc(title)}</h4>
            <div class="chart-legend">${legend}</div>
            <svg viewBox="0 0 ${width} ${height}" class="svg-chart" role="img">
                <line x1="${padding}" y1="${height - padding}" x2="${width - padding}" y2="${height - padding}" stroke="#d7dee8"></line>
                <line x1="${padding}" y1="${padding}" x2="${padding}" y2="${height - padding}" stroke="#d7dee8"></line>
                ${lines}
                ${labels}
            </svg>
        </div>
    `;
}

function groupedBarChart(rows, title) {
    if (!rows || !rows.length) return chartEmpty(title);

    const max = Math.max(...rows.flatMap(row => [Math.abs(valoareNumerica(row[1])), Math.abs(valoareNumerica(row[2]))]), 1);

    return `
        <div class="chart-block">
            <h4>${esc(title)}</h4>
            <div class="chart-legend">
                <span><i style="background:#1d4ed8"></i>Firma ta</span>
                <span><i style="background:#0f766e"></i>Media pietei</span>
            </div>
            ${rows.map(row => {
                const firma = valoareNumerica(row[1]);
                const piata = valoareNumerica(row[2]);
                const firmaWidth = Math.max(3, Math.abs(firma) / max * 100);
                const piataWidth = Math.max(3, Math.abs(piata) / max * 100);

                return `
                    <div class="compare-row">
                        <strong>${esc(row[0])}</strong>
                        <div>
                            <div class="bar-track"><div class="bar-fill" style="width:${firmaWidth}%; background:#1d4ed8"></div></div>
                            <small>${row[3] ? procent(firma) : numar(firma)}</small>
                        </div>
                        <div>
                            <div class="bar-track"><div class="bar-fill" style="width:${piataWidth}%; background:#0f766e"></div></div>
                            <small>${row[3] ? procent(piata) : numar(piata)}</small>
                        </div>
                    </div>
                `;
            }).join('')}
        </div>
    `;
}

function chartEmpty(title) {
    return `
        <div class="chart-block">
            <h4>${esc(title)}</h4>
            <p>Nu exista suficiente date pentru grafic.</p>
        </div>
    `;
}

/* RAPOARTE */

async function genereazaRaportFirma() {
    const id = val('firmaRaport') || state.firmaSelectataId;
    const el = document.getElementById('raportPreview');

    if (!id) {
        setHtml('raportPreview', '<p>Selecteaza o firma pentru raportul complet.</p>');
        return;
    }

    try {
        cereAutentificare();
        if (el) el.innerHTML = '<p>Se genereaza raportul complet...</p>';

        const firma = state.firmeUtilizator.find(item => String(item.id_firma) === String(id)) || {};
        const istoric = await api(`/api/date-firma-utilizator?id_firma=${encodeURIComponent(id)}`);
        const diagnostic = await api(`/api/diagnostic-firma-utilizator?id_firma=${encodeURIComponent(id)}`);
        const an = istoric.length ? istoric[istoric.length - 1].an : 2024;
        const comparatie = await api(`/api/comparatie?id_firma=${encodeURIComponent(id)}&an=${encodeURIComponent(an)}`);
        let previziune = null;

        try {
            previziune = await api(`/api/previziune-firma-utilizator?id_firma=${encodeURIComponent(id)}`);
        } catch (err) {
            previziune = { mesaj: err.message };
        }

        const raport = {
            firma,
            istoric,
            diagnostic,
            comparatie,
            previziune,
            an
        };

        setHtml('raportPreview', renderRaportCompletFirma(raport));
        adaugaRaport('Raport complet firma', [{
            firma: firma.denumire_firma || diagnostic.firma?.denumire_firma,
            cui: firma.cui || diagnostic.firma?.cui,
            an_analiza: an,
            scor_general: diagnostic.scoruri?.general,
            categorie_diagnostic: diagnostic.scoruri?.categorie,
            scor_competitiv: comparatie.scor_competitiv,
            categorie_imm: categorieImmClient(diagnostic.indicatori?.cifra_afaceri, diagnostic.indicatori?.nr_angajati)
        }]);
    } catch (err) {
        setHtml('raportPreview', `<p>${esc(err.message)}</p>`);
    }
}

function renderRaportCompletFirma(raport) {
    const firma = raport.firma || raport.diagnostic.firma || {};
    const indicatori = raport.diagnostic.indicatori || {};
    const scoruri = raport.diagnostic.scoruri || {};
    const interpretare = raport.diagnostic.interpretare || {};
    const categorieImm = categorieImmClient(indicatori.cifra_afaceri, indicatori.nr_angajati);
    const comparatie = raport.comparatie || {};
    const previziune = raport.previziune || {};

    return `
        <article class="report-cover">
            <h3>Raport financiar complet</h3>
            <p><strong>${esc(firma.denumire_firma || '-')}</strong> | CUI ${esc(firma.cui || '-')} | CAEN ${esc(firma.cod_caen || '-')}</p>
            <p>Raportul include date de identificare, istoric financiar, diagnostic, pozitionare competitiva, previziune si recomandari.</p>
        </article>

        <article>
            <h3>1. Date firma</h3>
            <div class="kpi-grid">
                <div class="kpi"><strong>${esc(firma.denumire_firma || '-')}</strong><span>Denumire</span></div>
                <div class="kpi"><strong>${esc(firma.cui || '-')}</strong><span>CUI</span></div>
                <div class="kpi"><strong>${esc(firma.cod_caen || '-')}</strong><span>Cod CAEN</span></div>
                <div class="kpi"><strong>${esc(categorieImm)}</strong><span>Clasificare IMM</span></div>
            </div>
        </article>

        <article>
            <h3>2. Istoric financiar</h3>
            ${raportTable(raport.istoric, ['an', 'cifra_afaceri', 'profit_net', 'datorii', 'active_totale', 'nr_angajati'])}
        </article>

        <article>
            <h3>3. Diagnostic financiar</h3>
            <div class="kpi-grid">
                <div class="kpi"><strong>${esc(scoruri.general || '-')}</strong><span>Scor general</span></div>
                <div class="kpi"><strong>${esc(scoruri.categorie || '-')}</strong><span>Categorie diagnostic</span></div>
                <div class="kpi"><strong>${procent(indicatori.marja_profitului)}</strong><span>Marja profitului</span></div>
                <div class="kpi"><strong>${procent(indicatori.grad_indatorare)}</strong><span>Grad de indatorare</span></div>
            </div>
            <p>${esc(interpretare.concluzie_generala || '')}</p>
            <p><strong>Metodologie:</strong> scor general = 35% profitabilitate + 25% eficienta + 20% risc + 20% crestere.</p>
        </article>

        <article>
            <h3>4. Comparatie cu piata CAEN</h3>
            <p>Scor competitiv: <strong>${esc(comparatie.scor_competitiv || '-')}</strong> / 100. Pozitie estimata dupa cifra de afaceri: <strong>${comparatie.pozitie_piata ? '#' + numar(comparatie.pozitie_piata) : '-'}</strong>.</p>
            ${raportTable(comparatie.indicatori_comparatie || [], ['eticheta', 'firma', 'piata', 'diferenta', 'interpretare'])}
        </article>

        <article>
            <h3>5. Previziune</h3>
            ${previziune.scenarii ? raportTable(previziune.scenarii, ['eticheta', 'an', 'cifra_afaceri', 'profit_net', 'datorii', 'nr_angajati']) : `<p>${esc(previziune.mesaj || 'Nu exista previziune disponibila.')}</p>`}
        </article>

        <article>
            <h3>6. Concluzii si recomandari</h3>
            <ul>
                ${(interpretare.concluzii || []).map(item => `<li>${esc(item)}</li>`).join('')}
                ${(interpretare.recomandari || []).map(item => `<li>${esc(item)}</li>`).join('')}
            </ul>
        </article>
    `;
}

function raportTable(rows, coloane) {
    if (!rows || !rows.length) return '<p>Nu exista date disponibile.</p>';

    return `
        <div class="table-wrap report-table">
            <table>
                <thead>
                <tr>${coloane.map(col => `<th>${esc(transformaNumeColoana(col))}</th>`).join('')}</tr>
                </thead>
                <tbody>
                ${rows.map(row => `
                    <tr>${coloane.map(col => `<td>${formateazaRaport(row[col])}</td>`).join('')}</tr>
                `).join('')}
                </tbody>
            </table>
        </div>
    `;
}

function actualizeazaRaport() {
    const el = document.getElementById('raportPreview');

    if (!el) return;

    if (!state.raport.length) {
        el.innerHTML = '<p>Nu exista rezultate in raport. Incarca mai intai diagnostic, comparatie, previziune, dashboard sau analize.</p>';
        return;
    }

    el.innerHTML = `
        <article>
            <h3>Raport financiar IMM</h3>
            <p>Raport generat din ultimele analize rulate in aplicatie. Include sectiuni de diagnostic, comparatie, previziune si sinteze de piata, in functie de datele incarcate.</p>
        </article>
        ${state.raport.map(section => raportSection(section)).join('')}
    `;
}

function raportSection(section) {
    const rows = Array.isArray(section.rows) ? section.rows : [];
    const coloane = [...new Set(rows.slice(0, 8).flatMap(row => Object.keys(row || {}).filter(key => typeof row[key] !== 'object')))].slice(0, 6);

    return `
        <article>
            <h3>${esc(section.titlu)}</h3>
            <p>${rows.length} inregistrari incluse. ${textRaport(section.titlu, rows)}</p>
            ${coloane.length ? `
                <div class="table-wrap report-table">
                    <table>
                        <thead>
                        <tr>${coloane.map(col => `<th>${esc(transformaNumeColoana(col))}</th>`).join('')}</tr>
                        </thead>
                        <tbody>
                        ${rows.slice(0, 8).map(row => `
                            <tr>${coloane.map(col => `<td>${formateazaRaport(row[col])}</td>`).join('')}</tr>
                        `).join('')}
                        </tbody>
                    </table>
                </div>
            ` : '<p>Rezultatul este disponibil in sectiunea analizata.</p>'}
        </article>
    `;
}

function textRaport(titlu, rows) {
    if (!rows.length) return 'Nu exista date suficiente pentru concluzii.';
    if (titlu.includes('Diagnostic')) return 'Sectiunea sintetizeaza scorul general, categoria de risc si concluzia diagnosticului.';
    if (titlu.includes('Comparatie')) return 'Sectiunea arata pozitionarea firmei fata de media pietei si indicatorii competitivi.';
    if (titlu.includes('Previziune')) return 'Sectiunea prezinta scenariile de evolutie pentru anul urmator.';
    if (titlu.includes('Dashboard')) return 'Sectiunea sintetizeaza indicatorii agregati ai pietei.';
    if (titlu.includes('sectoriala')) return 'Sectiunea compara sectoare CAEN dupa volum, profitabilitate si risc.';
    return 'Sectiunea contine rezultate relevante pentru analiza financiara.';
}

function formateazaRaport(value) {
    if (value === null || value === undefined || value === '') return '';
    if (typeof value === 'number') return numar(value);
    return esc(String(value));
}

function exportCsv() {
    const rows = state.raport.flatMap(section => section.rows.map(row => ({ sectiune: section.titlu, ...row })));

    if (!rows.length) {
        alert('Nu exista date de exportat.');
        return;
    }

    const keys = [...new Set(rows.flatMap(row => Object.keys(row)))];
    const csv = [
        keys.join(','),
        ...rows.map(row => keys.map(key => `"${String(row[key] ?? '').replaceAll('"', '""')}"`).join(','))
    ].join('\n');

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const link = document.createElement('a');

    link.href = URL.createObjectURL(blob);
    link.download = 'raport_imm.csv';
    link.click();
}

function adaugaRaport(titlu, rows) {
    state.raport = state.raport.filter(r => r.titlu !== titlu);
    state.raport.unshift({ titlu, rows: Array.isArray(rows) ? rows : [] });
    state.raport = state.raport.slice(0, 8);
}

/* UTILITARE */

function val(id) {
    const el = document.getElementById(id);
    return el ? el.value.trim() : '';
}

function setValue(id, value) {
    const el = document.getElementById(id);
    if (el) el.value = value ?? '';
}

function setText(id, value) {
    const el = document.getElementById(id);
    if (el) el.innerText = value || '';
}

function setHtml(id, value) {
    const el = document.getElementById(id);
    if (el) el.innerHTML = value || '';
}

function emailValid(email) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function parolaValida(parola) {
    return parola.length >= 6 && !/^\d+$/.test(parola);
}

function numarPozitivSauZero(id, eticheta, obligatoriu = true) {
    const value = val(id);

    if (!value && !obligatoriu) return null;
    if (!value) throw new Error(`${eticheta} este obligatoriu.`);

    const number = Number(value);

    if (!Number.isFinite(number) || number < 0) {
        throw new Error(`${eticheta} trebuie sa fie un numar pozitiv.`);
    }

    return number;
}

function valoareNumerica(value) {
    if (value === null || value === undefined || value === '') return 0;
    if (typeof value === 'number') return Number.isFinite(value) ? value : 0;

    const curatat = String(value).replace(/\s/g, '').replace(',', '.');
    const number = Number(curatat);

    return Number.isFinite(number) ? number : 0;
}

function numar(value) {
    if (value === null || value === undefined || value === '') return '';
    return Number(value).toLocaleString('ro-RO', { maximumFractionDigits: 2 });
}

function procent(value) {
    if (value === null || value === undefined || value === '') return '';
    return Number(value).toLocaleString('ro-RO', { maximumFractionDigits: 2 }) + '%';
}

function randMesaj(colspan, mesaj) {
    return `<tr><td colspan="${colspan}" class="empty">${esc(mesaj)}</td></tr>`;
}

function esc(value) {
    return String(value ?? '').replace(/[&<>"']/g, char => ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#039;'
    }[char]));
}

function transformaNumeColoana(col) {
    return col.replaceAll('_', ' ').replace(/\b\w/g, litera => litera.toUpperCase());
}

function calcMarja(firma) {
    return Number(firma.cifra_afaceri)
        ? Number(firma.profit_net || 0) / Number(firma.cifra_afaceri) * 100
        : null;
}

function calcIndatorare(firma) {
    return Number(firma.active_totale)
        ? Number(firma.datorii || 0) / Number(firma.active_totale) * 100
        : null;
}

function anRaportare(id) {
    const an = Number(val(id) || 2024);

    if (!ANI_RAPORTARE.includes(an)) {
        throw new Error('Anul trebuie sa fie intre 2016 si 2024.');
    }

    return an;
}

function evolutieProcentuala(anterior, curent) {
    const a = valoareNumerica(anterior);
    const c = valoareNumerica(curent);

    if (!a) return 0;
    return (c - a) / Math.abs(a) * 100;
}

function categorieImmClient(cifraAfaceri, nrAngajati) {
    const cifra = valoareNumerica(cifraAfaceri);
    const angajati = valoareNumerica(nrAngajati);

    if (angajati < 10 && cifra <= 2000000) return 'Microintreprindere';
    if (angajati < 50 && cifra <= 10000000) return 'Intreprindere mica';
    if (angajati < 250 && cifra <= 50000000) return 'Intreprindere mijlocie';
    return 'Intreprindere mare';
}

function pieChart(data, labelKey, valueKey, title) {
    if (!data || !data.length) return chartEmpty(title);

    const total = data.reduce((sum, row) => sum + valoareNumerica(row[valueKey]), 0) || 1;
    const colors = ['#1d4ed8', '#0f766e', '#b45309', '#7c3aed', '#b91c1c', '#475569'];
    let startAngle = -90;

    function punct(cx, cy, r, angle) {
        const rad = angle * Math.PI / 180;
        return {
            x: cx + r * Math.cos(rad),
            y: cy + r * Math.sin(rad)
        };
    }

    const slices = data.map((row, index) => {
        const value = valoareNumerica(row[valueKey]);
        const angle = value / total * 360;
        const endAngle = startAngle + angle;
        const start = punct(90, 90, 72, startAngle);
        const end = punct(90, 90, 72, endAngle);
        const largeArc = angle > 180 ? 1 : 0;
        const path = `
            <path
                d="M 90 90 L ${start.x} ${start.y} A 72 72 0 ${largeArc} 1 ${end.x} ${end.y} Z"
                fill="${colors[index % colors.length]}"
            ></path>
        `;

        startAngle = endAngle;
        return path;
    }).join('');

    const legend = data.map((row, index) => {
        const value = valoareNumerica(row[valueKey]);
        const pondere = total ? value / total * 100 : 0;
        return `
            <span><i style="background:${colors[index % colors.length]}"></i>${esc(row[labelKey])}: ${procent(pondere)}</span>
        `;
    }).join('');

    return `
        <div class="chart-block donut-layout">
            <div>
                <h4>${esc(title)}</h4>
                <div class="chart-legend vertical">${legend}</div>
            </div>
            <svg viewBox="0 0 180 180" class="pie-chart" role="img">
                ${slices}
                <circle cx="90" cy="90" r="72" fill="none" stroke="#ffffff" stroke-width="2"></circle>
            </svg>
        </div>
    `;
}

function clasaStatus(status) {
    if (status === 'Bun') return 'good';
    if (status === 'Atentie') return 'watch';
    if (status === 'Risc') return 'risk';
    if (status === 'Peste medie') return 'good';
    if (status === 'Aproape de medie') return 'watch';
    if (status === 'Sub medie') return 'risk';
    return 'neutral';
}
