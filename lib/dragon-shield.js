const fs = require('fs');
const https = require('https');
const puppeteer = require('puppeteer');
const fetch = require('node-fetch');
const {parse} = require('fast-csv');

const {DRAGONSHIELD_USERNAME, DRAGONSHIELD_PASSWORD} = process.env;

// = UTILS =====

const ENDPOINT = `https://api-mtg.dragonshield.com/api/v1`;

const get = async (token, url) => {
    const response = await fetch(`${ENDPOINT}/${url}`, {
        headers: {Authorization: `bearer ${token}`},
    });
    const {data} = await response.json();
    return data;
};

const download = (filepath, url) => {
    return new Promise((resolve, rejects) => {
        const file = fs.createWriteStream(filepath);
        https.get(url, (response) => {
            response.pipe(file);
            file.on('error', (err) => {
                file.close();
                rejects(err);
            });
            file.on('finish', () => {
                file.close();
                resolve();
            });
        });
    });
};

// = OAUTH =====

module.exports.getDragonShieldToken = async () => {
    const browser = await puppeteer.launch();
    const page = await browser.newPage();
    await page.goto(`https://auth.dragonshield.com/Account/Login`);

    await page.type('#Email', DRAGONSHIELD_USERNAME);
    await page.type('#Password', DRAGONSHIELD_PASSWORD);

    await Promise.all([
        //
        page.waitForNavigation(),
        page.keyboard.press('Enter'),
    ]);

    await page.goto(`https://mtg.dragonshield.com/folders`);
    await page.waitForSelector('.sprite-icon-export-default');

    const token = await page.evaluate(() => window.localStorage.getItem('access_token'));

    await browser.close();

    return token;
};

// = REQUESTS =====

module.exports.getDragonShieldFolders = (token) => get(token, `portalfolders`);
module.exports.getDragonShieldFolder = (token, id) => get(token, `portalfolders/${id}`);
module.exports.getDragonShieldFolderCards = (token, id, page) =>
    get(token, `portalfolders/${id}/cards&pageSize=100&pageNumber=${page}&orderBy=nameAsc&lang=en`);

module.exports.createDragonShieldFolder = async (token, name) => {
    await fetch(`https://api-mtg.dragonshield.com/api/v1/portalfolders?provider=tcgplayer`, {
        method: 'POST',
        body: JSON.stringify({name}),
        headers: {
            Authorization: `bearer ${token}`,
            'Content-Type': 'application/json',
        },
    });
};
module.exports.deleteDragonShieldFolder = (token, id, version) =>
    fetch(`${ENDPOINT}/portalfolders/${id}/version/${version}`, {
        method: 'DELETE',
        headers: {Authorization: `bearer ${token}`},
    });

module.exports.downloadDragonShieldFolders = async (token, filepath) => {
    const {exportUrl} = await get(token, `folders/export`);
    await download(filepath, exportUrl);
};
module.exports.downloadDragonShieldFolder = async (token, id, filepath) => {
    const {exportUrl} = await get(token, `folders/${id}/export`);
    await download(filepath, exportUrl);
};

// = CSV =====

module.exports.readCsvFromDragonShield = (filepath) => {
    return new Promise((resolve, reject) => {
        let n = 0;
        const cards = new Map();
        fs.createReadStream(filepath)
            .pipe(parse({headers: true, skipLines: 1}))
            .on('error', (error) => reject(error))
            .on('data', (row) => {
                const name = row['Card Name'];
                const count = Number(row['Quantity']);
                const current = cards.has(name) ? cards.get(name) : 0;
                cards.set(name, current + count);
            })
            .on('end', () => {
                resolve(cards);
            });
    });
};
