const fs = require('fs');
const puppeteer = require('puppeteer');
const fetch = require('node-fetch');
const FormData = require('form-data');
const {format} = require('fast-csv');

const {getCardData} = require('./scryfall');

const {MOXFIELD_USERNAME, MOXFIELD_PASSWORD} = process.env;

// = OAUTH =====

module.exports.getMoxfieldToken = async () => {
    const browser = await puppeteer.launch();

    const page = await browser.newPage();

    let token;
    await page.setRequestInterception(true);
    page.on('request', (interceptedRequest) => {
        token = interceptedRequest.headers()['authorization'] ?? token;
        interceptedRequest.continue();
    });

    await page.goto(`https://www.moxfield.com/account/signin`);

    await page.type('#username', MOXFIELD_USERNAME);
    await page.type('#password', MOXFIELD_PASSWORD);

    await Promise.all([
        //
        page.waitForNavigation(),
        page.keyboard.press('Enter'),
    ]);

    await page.waitForSelector('.deckbox');
    await browser.close();

    return token;
};

// = REQUESTS =====

module.exports.importToMoxfield = async (token, filepath) => {
    const url = `https://api2.moxfield.com/v1/collections/import-file?game=paper&defaultCondition=nearMint&defaultCardLanguageId=LD58x&defaultQuantity=1&playStay=paperDollars&format=moxfield`;

    const formData = new FormData();
    formData.append('file', fs.createReadStream(filepath));

    const response = await fetch(url, {
        method: 'POST',
        body: formData,
        headers: {...formData.getHeaders(), Authorization: token},
    });
    const data = await response.json();
    // console.log(data);
};

// = CSV =====

module.exports.writeCsvForMoxfield = async (cards, filepath) => {
    return new Promise(async (resolve, reject) => {
        const outputCsvStream = format({headers: true});
        outputCsvStream.pipe(fs.createWriteStream(filepath));
        outputCsvStream.on('error', (error) => reject(error));
        let n = 0;
        for (const [name, count] of cards.entries()) {
            const data = await getCardData(name);
            const row = {
                Count: count,
                'Tradelist Count': 0,
                Name: name,
                Edition: data.printing,
                Condition: 'Near Mint',
                Language: 'English',
                Foil: '',
                Tags: '',
                'Last Modified': new Date().toISOString(),
                'Collector Number': '',
            };
            outputCsvStream.write(row);
        }
        outputCsvStream.end();
        resolve();
    });
};
