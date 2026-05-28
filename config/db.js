const { Sequelize } = require('sequelize');
const fs = require('fs');
const path = require('path');

const envPath = path.join(__dirname, '..', '.env');

if (fs.existsSync(envPath)) {
    const lines = fs.readFileSync(envPath, 'utf8').split(/\r?\n/);

    lines.forEach(line => {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#') || !trimmed.includes('=')) return;

        const [key, ...valueParts] = trimmed.split('=');
        const value = valueParts.join('=').trim();

        if (!process.env[key]) {
            process.env[key] = value;
        }
    });
}

const sequelize = new Sequelize(
    process.env.DB_NAME || 'Licenta_IMM',
    process.env.DB_USER || 'postgres',
    process.env.DB_PASSWORD || '',
    {
        host: process.env.DB_HOST || 'localhost',
        port: Number(process.env.DB_PORT || 5432),
        dialect: 'postgres',
        logging: process.env.DB_LOGGING === 'true' ? console.log : false
    }
);

if (!process.env.DB_PASSWORD) {
    console.warn('DB_PASSWORD nu este setat. Configureaza parola in variabilele de mediu sau intr-un fisier .env local.');
}

module.exports = sequelize;
