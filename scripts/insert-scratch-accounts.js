"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const postgres_1 = __importDefault(require("postgres"));
const sql = (0, postgres_1.default)(process.env.POSTGRES_URL, { ssl: 'require' });
const accounts = [
    { username: 'zebrafuncoder402', password: 'zebra123' },
    { username: 'zebrafuncoder403', password: 'zebra123' },
    { username: 'zebrafuncoder404', password: 'zebra123' },
    { username: 'zebrafuncoder405', password: 'zebra123' },
    { username: 'zebrafuncoder406', password: 'zebra123' },
    { username: 'zebrafuncoder407', password: 'zebra123' },
    { username: 'zebrafuncoder408', password: 'zebra123' },
    { username: 'zebrafuncoder409', password: 'zebra123' },
    { username: 'zebrafuncoder410', password: 'zebra123' },
    { username: 'zebrafuncoder411', password: 'zebra123' },
    { username: 'zebrafuncoder412', password: 'zebra123' },
    { username: 'zebrafuncoder413', password: 'zebra123' },
    { username: 'zebrafuncoder414', password: 'zebra123' },
    { username: 'zebrafuncoder415', password: 'zebra123' },
    { username: 'zebrafuncoder416', password: 'zebra123' },
    { username: 'zebrafuncoder417', password: 'zebra123' },
    { username: 'zebrafuncoder418', password: 'zebra123' },
    { username: 'zebrafuncoder419', password: 'zebra123' },
    { username: 'zebrafuncoder420', password: 'zebra123' },
    { username: 'zebrafuncoder421', password: 'zebra123' },
    { username: 'zebrafuncoder422', password: 'zebra123' },
    { username: 'zebrafuncoder423', password: 'zebra123' },
    { username: 'zebrafuncoder424', password: 'zebra123' },
    { username: 'zebrafuncoder425', password: 'zebra123' },
    { username: 'zebrafuncoder426', password: 'zebra123' },
    { username: 'zebrafuncoder427', password: 'zebra123' },
    { username: 'zebrafuncoder428', password: 'zebra123' },
    { username: 'zebrafuncoder429', password: 'zebra123' },
    { username: 'zebrafuncoder430', password: 'zebra123' },
    { username: 'zebrafuncoder431', password: 'zebra123' },
    { username: 'zebrafuncoder432', password: 'zebra123' },
    { username: 'zebrafuncoder433', password: 'zebra123' },
    { username: 'zebrafuncoder434', password: 'zebra123' },
    { username: 'zebrafuncoder435', password: 'zebra123' },
    { username: 'zebrafuncoder436', password: 'zebra123' },
    { username: 'zebrafuncoder437', password: 'zebra123' },
    { username: 'zebrafuncoder438', password: 'zebra123' },
    { username: 'zebrafuncoder439', password: 'zebra123' },
    { username: 'zebrafuncoder440', password: 'zebra123' },
    { username: 'zebrafuncoder441', password: 'zebra123' },
    { username: 'zebrafuncoder442', password: 'zebra123' },
    { username: 'zebrafuncoder443', password: 'zebra123' },
    { username: 'zebrafuncoder444', password: 'zebra123' },
    { username: 'zebrafuncoder445', password: 'zebra123' },
    { username: 'zebrafuncoder446', password: 'zebra123' },
    { username: 'zebrafuncoder447', password: 'zebra123' },
    { username: 'zebrafuncoder448', password: 'zebra123' },
    { username: 'zebrafuncoder449', password: 'zebra123' },
    { username: 'zebrafuncoder450', password: 'zebra123' },
    { username: 'zebrafuncoder451', password: 'zebra123' },
    { username: 'zebrafuncoder452', password: 'zebra123' },
    { username: 'zebrafuncoder453', password: 'zebra123' },
    { username: 'zebrafuncoder454', password: 'zebra123' },
    { username: 'zebrafuncoder455', password: 'zebra123' },
    { username: 'zebrafuncoder456', password: 'zebra123' },
    { username: 'zebrafuncoder457', password: 'zebra123' },
    { username: 'zebrafuncoder458', password: 'zebra123' },
    { username: 'zebrafuncoder459', password: 'zebra123' },
    { username: 'zebrafuncoder460', password: 'zebra123' },
    { username: 'zebrafuncoder461', password: 'zebra123' },
    { username: 'zebrafuncoder462', password: 'zebra123' },
    { username: 'zebrafuncoder463', password: 'zebra123' },
    { username: 'zebrafuncoder464', password: 'zebra123' },
    { username: 'zebrafuncoder465', password: 'zebra123' },
    { username: 'zebrafuncoder466', password: 'zebra123' },
    { username: 'zebrafuncoder467', password: 'zebra123' },
    { username: 'zebrafuncoder468', password: 'zebra123' },
    { username: 'zebrafuncoder469', password: 'zebra123' },
    { username: 'zebrafuncoder470', password: 'zebra123' },
    { username: 'zebrafuncoder471', password: 'zebra123' },
    { username: 'zebrafuncoder472', password: 'zebra123' },
    { username: 'zebrafuncoder473', password: 'zebra123' },
    { username: 'zebrafuncoder474', password: 'zebra123' },
    { username: 'zebrafuncoder475', password: 'zebra123' },
    { username: 'zebrafuncoder476', password: 'zebra123' },
    { username: 'zebrafuncoder477', password: 'zebra123' },
    { username: 'zebrafuncoder478', password: 'zebra123' },
    { username: 'zebrafuncoder479', password: 'zebra123' },
    { username: 'zebrafuncoder480', password: 'zebra123' },
    { username: 'zebrafuncoder481', password: 'zebra123' },
    { username: 'zebrafuncoder482', password: 'zebra123' },
    { username: 'zebrafuncoder483', password: 'zebra123' },
    { username: 'zebrafuncoder484', password: 'zebra123' },
    { username: 'zebrafuncoder485', password: 'zebra123' },
    { username: 'zebrafuncoder486', password: 'zebra123' },
    { username: 'zebrafuncoder487', password: 'zebra123' },
    { username: 'zebrafuncoder488', password: 'zebra123' },
    { username: 'zebrafuncoder489', password: 'zebra123' },
    { username: 'zebrafuncoder490', password: 'zebra123' },
    { username: 'zebrafuncoder491', password: 'zebra123' },
    { username: 'zebrafuncoder492', password: 'zebra123' },
    { username: 'zebrafuncoder493', password: 'zebra123' },
    { username: 'zebrafuncoder494', password: 'zebra123' },
    { username: 'zebrafuncoder495', password: 'zebra123' },
    { username: 'zebrafuncoder496', password: 'zebra123' },
    { username: 'zebrafuncoder497', password: 'zebra123' },
    { username: 'zebrafuncoder498', password: 'zebra123' },
    { username: 'zebrafuncoder499', password: 'zebra123' },
    { username: 'zebrafuncoder500', password: 'zebra123' },
    { username: 'zebrafuncoder501', password: 'zebra123' },
    { username: 'zebrafuncoder502', password: 'zebra123' },
    { username: 'zebrafuncoder503', password: 'zebra123' },
    { username: 'zebrafuncoder504', password: 'zebra123' },
    { username: 'zebrafuncoder505', password: 'zebra123' },
    { username: 'zebrafuncoder506', password: 'zebra123' },
    { username: 'zebrafuncoder507', password: 'zebra123' },
    { username: 'zebrafuncoder508', password: 'zebra123' },
    { username: 'zebrafuncoder509', password: 'zebra123' },
    { username: 'zebrafuncoder510', password: 'zebra123' },
    { username: 'zebrafuncoder511', password: 'zebra123' },
    { username: 'zebrafuncoder512', password: 'zebra123' },
    { username: 'zebrafuncoder513', password: 'zebra123' },
    { username: 'zebrafuncoder514', password: 'zebra123' },
    { username: 'zebrafuncoder515', password: 'zebra123' },
    { username: 'zebrafuncoder516', password: 'zebra123' },
    { username: 'zebrafuncoder517', password: 'zebra123' },
    { username: 'zebrafuncoder518', password: 'zebra123' },
    { username: 'zebrafuncoder519', password: 'zebra123' },
    { username: 'zebrafuncoder520', password: 'zebra123' },
    { username: 'zebrafuncoder521', password: 'zebra123' },
    { username: 'zebrafuncoder522', password: 'zebra123' },
    { username: 'zebrafuncoder523', password: 'zebra123' },
    { username: 'zebrafuncoder524', password: 'zebra123' },
];
async function insertAccounts() {
    try {
        console.log(`Inserting ${accounts.length} scratch accounts...`);
        for (const account of accounts) {
            await sql `
        INSERT INTO scratch_accounts (username, password, student_id)
        VALUES (${account.username}, ${account.password}, null)
      `;
            console.log(`Inserted: ${account.username}`);
        }
        console.log(`\nSuccessfully inserted ${accounts.length} accounts!`);
        await sql.end();
        process.exit(0);
    }
    catch (error) {
        console.error('Error inserting accounts:', error);
        await sql.end();
        process.exit(1);
    }
}
insertAccounts();
