const fs = require('fs');
const path = require('path');
const https = require('https');
const fetch = require('node-fetch');
const ora = require('ora');

const dataPath = path.resolve('downloads', 'data.json');

// = UTILS =====

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

// = REFRESH =====

const SHOULD_REFRESH_AFTER = 1e3 * 60 * 60 * 24 * 7;

let shouldRefresh = true;
const refreshData = async () => {
    if (!shouldRefresh) return;
    shouldRefresh = false;

    if (fs.existsSync(dataPath)) {
        const stats = fs.statSync(dataPath);
        const timeSinceRefresh = Date.now() - stats.mtimeMs;
        if (timeSinceRefresh <= SHOULD_REFRESH_AFTER) return;
    }

    const spinner = ora({text: 'Refresh oracle data', prefixText: '  '}).start();

    const bulkData = await fetch(`https://api.scryfall.com/bulk-data`)
        .then((response) => response.json())
        .then(({data}) => data);
    const oracleData = bulkData.find((d) => d.type === 'oracle_cards');

    await download(dataPath, oracleData.download_uri);

    oracle = require(dataPath);

    spinner.succeed();
};

// = DATA ===

let oracle;

const InvalidSets = [
    // 'core', // A yearly Magic core set (Tenth Edition, etc)
    // 'expansion', // A rotational expansion set in a block (Zendikar, etc)
    // 'masters', // A reprint set that contains no new cards (Modern Masters, etc)
    'alchemy', // An Arena set designed for Alchemy
    // 'masterpiece', // Masterpiece Series premium foil cards
    // 'arsenal', // A Commander-oriented gift set
    // 'from_the_vault', // From the Vault gift sets
    // 'spellbook', // Spellbook series gift sets
    // 'premium_deck', // Premium Deck Series decks
    // 'duel_deck', // Duel Decks
    // 'draft_innovation', // Special draft sets, like Conspiracy and Battlebond
    'treasure_chest', // Magic Online treasure chest prize sets
    // 'commander', // Commander preconstructed decks
    // 'planechase', // Planechase sets
    // 'archenemy', // Archenemy sets
    'vanguard', // Vanguard card sets
    'funny', // A funny un-set or set with funny promos (Unglued, Happy Holidays, etc)
    // 'starter', // A starter/introductory set (Portal, etc)
    // 'box', // A gift box set
    'promo', // A set that contains purely promotional cards
    'token', // A set made up of tokens and emblems.
    'memorabilia', // A set made up of gold-bordered, oversize, or trophy cards that are not legal
];

module.exports.getCardData = async (name) => {
    await refreshData();

    const raw =
        oracle.find((c) => !InvalidSets.includes(c.set_type) && c.name === name) ||
        oracle.find((c) => !InvalidSets.includes(c.set_type) && c.name.startsWith(name + ' // '));

    if (!raw) {
        throw new Error(`Could not find card "${name}"`);
    }

    try {
        return {
            name: raw.name,
            image: raw.card_faces?.[0].image_uris?.normal ?? raw.image_uris?.normal ?? '',
            printing: raw.set.toUpperCase(),
        };
    } catch (error) {
        console.error(name);
        throw error;
    }
};
