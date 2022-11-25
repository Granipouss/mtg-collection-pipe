require('dotenv').config();

const fs = require('fs');
const path = require('path');
const ora = require('ora');

const {
    readCsvFromDragonShield,
    getDragonShieldToken,
    getDragonShieldFolders,
    deleteDragonShieldFolder,
    createDragonShieldFolder,
    downloadDragonShieldFolder,
} = require('./lib/dragon-shield');
const {writeCsvForMoxfield, getMoxfieldToken, importToMoxfield} = require('./lib/moxfield');

const IMPORT_FOLDER = 'AUTO-IMPORT';

const spinning = async (label, promise) => {
    const spinner = ora({text: label, prefixText: '  '}).start();
    try {
        const result = await promise;
        spinner.succeed();
        return result;
    } catch (error) {
        spinner.fail();
        throw error;
    }
};

// = SCRIPT =====

(async () => {
    let cards;

    const dragonShieldPath = path.resolve('downloads', 'tmp-ds.csv');
    const moxfieldPath = path.resolve('downloads', 'tmp-mf.csv');

    {
        console.log('1. Download from DragonShield');
        const token = await spinning('Authentication', getDragonShieldToken());
        const folders = await spinning('Listing', getDragonShieldFolders(token));
        const folder = folders.find((f) => f.name === IMPORT_FOLDER);
        if (!folder) throw new Error(`No "${IMPORT_FOLDER}" folder found on DragonShield`);
        await spinning('Download', downloadDragonShieldFolder(token, folder.friendlyId, dragonShieldPath));
    }

    {
        console.log('2. Convert from DragonShield to MoxField');
        cards = await spinning('Parse DragonShield', readCsvFromDragonShield(dragonShieldPath));
        await spinning('Convert to MoxField', writeCsvForMoxfield(cards, moxfieldPath));
    }

    if (cards.size < 1) {
        console.log('No card to add');
        fs.unlinkSync(dragonShieldPath);
        fs.unlinkSync(moxfieldPath);
        return;
    }

    {
        console.log('3. Upload to MoxField');
        const token = await spinning('Authentication', getMoxfieldToken());
        await spinning('Upload', importToMoxfield(token, moxfieldPath));
    }

    {
        console.log('4. Online cleanup');
        const token = await spinning('Authentication', getDragonShieldToken());
        const folders = await spinning('Listing', getDragonShieldFolders(token));
        const folder = folders.find((f) => f.name === IMPORT_FOLDER);
        if (folder) {
            await spinning('Delete old folder', deleteDragonShieldFolder(token, folder.friendlyId, folder.version));
        }
        await spinning('Create new folder', createDragonShieldFolder(token, IMPORT_FOLDER));
    }

    {
        console.log('5. Local cleanup');
        fs.unlinkSync(dragonShieldPath);
        fs.unlinkSync(moxfieldPath);
    }

    {
        const total = Array.from(cards.values()).reduce((c, v) => c + v, 0);
        console.log('');
        console.log(total, 'Added');
        for (const [name, count] of cards.entries()) {
            console.log(`   + ${String(count).padStart(2, ' ')} ${name}`);
        }
    }
})();
