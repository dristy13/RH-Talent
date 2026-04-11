require('dotenv').config();
const express = require('express');
const nodemailer = require('nodemailer');
const cors = require('cors');
const bodyParser = require('body-parser');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');

const app = express();
const PORT = process.env.PORT || 5000;

// Trust the first proxy (e.g., Render, Heroku)
app.set('trust proxy', 1);

// Security Middleware
app.use(helmet({
    contentSecurityPolicy: false,
}));

// Block access to sensitive files (Security Fix)
app.use((req, res, next) => {
    const blocked = ['.env', '.git', 'database.sqlite', 'server.js', 'package.json'];
    const url = req.url.toLowerCase();
    if (blocked.some(file => url.includes(file.toLowerCase()))) {
        return res.status(403).send('Forbidden: Access to this file is restricted for security.');
    }
    next();
});

const limiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 5000, // Very high limit of 5000 requests per 15 minutes
    message: { message: "Too many requests from this IP, please try again after 15 minutes." }
});

// Apply rate limiting to all requests
app.use(limiter);

// Specific rate limit for contact form (prevent spam)
const contactLimiter = rateLimit({
    windowMs: 60 * 60 * 1000, // 1 hour
    max: 100, // Even higher limit for contact submissions
    message: { message: "Too many message attempts. Please wait an hour before trying again." }
});

// Middleware
app.use(cors());
app.use(bodyParser.json());
app.use('/api/contact', contactLimiter);
app.use(express.static(path.join(__dirname, './')));

// Database Setup
const db = new sqlite3.Database('./database.sqlite', (err) => {
    if (err) {
        console.error('Error opening database:', err.message);
    } else {
        console.log('Connected to the SQLite database.');
        db.run(`CREATE TABLE IF NOT EXISTS messages (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT,
            phone TEXT,
            email TEXT,
            message TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )`);
    }
});

// SMTP Configuration (REPLACE WITH YOUR ACTUAL EMAIL CREDENTIALS)
const transporter = nodemailer.createTransport({
    service: 'gmail', // or another service like 'Outlook', 'Yandex', or custom SMTP
    auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS
    }
});

// API Routes
app.post('/api/contact', (req, res) => {
    const { name, phone, email, message } = req.body;

    // 1. Save to Database
    const query = `INSERT INTO messages (name, phone, email, message) VALUES (?, ?, ?, ?)`;
    db.run(query, [name, phone, email, message], function (err) {
        if (err) {
            console.error(err.message);
            return res.status(500).json({ success: false, message: 'Database error' });
        }

        // 2. Return success to the browser IMMEDIATELY so the user doesn't wait
        res.status(200).json({ 
            success: true, 
            message: 'Message sent and saved successfully!', 
            id: this.lastID 
        });

        // 3. Send Email in the BACKGROUND
        const mailOptions = {
            from: process.env.EMAIL_USER,
            to: process.env.EMAIL_USER,
            subject: `New Contact Form Submission from ${name}`,
            text: `
                New message received:
                Name: ${name}
                Phone: ${phone}
                Email: ${email}
                Message: ${message}
            `
        };

        transporter.sendMail(mailOptions, (error, info) => {
            if (error) {
                console.error('Background Email error:', error);
            } else {
                console.log('Background Email sent: ' + info.response);
            }
        });
    });
});

// API Route to view messages (Dashboard) with basic security
app.get('/admin-view', (req, res) => {
    const password = req.query.pw;
    if (password !== process.env.ADMIN_PASSWORD) {
        return res.status(401).send("Unauthorized: Please provide the correct password in the URL (e.g., /admin-view?pw=yourpassword)");
    }

    db.all("SELECT * FROM messages ORDER BY created_at DESC", [], (err, rows) => {
        if (err) return res.status(500).send("Database Error");

        let html = `
            <html>
            <head>
                <title>Message Dashboard</title>
                <style>
                    body { font-family: sans-serif; padding: 20px; background: #f4f4f4; }
                    table { width: 100%; border-collapse: collapse; background: #fff; }
                    th, td { padding: 12px; border: 1px solid #ddd; text-align: left; }
                    th { background: #c9a84c; color: white; }
                    tr:nth-child(even) { background: #f9f9f9; }
                    h2 { color: #1a1a1a; }
                </style>
            </head>
            <body>
                <h2>Contact Form Submissions</h2>
                <table>
                    <tr>
                        <th>ID</th>
                        <th>Date</th>
                        <th>Name</th>
                        <th>Phone</th>
                        <th>Email</th>
                        <th>Message</th>
                    </tr>
                    ${rows.map(row => `
                        <tr>
                            <td>${row.id}</td>
                            <td>${new Date(row.created_at).toLocaleString()}</td>
                            <td>${row.name}</td>
                            <td>${row.phone}</td>
                            <td>${row.email}</td>
                            <td>${row.message}</td>
                        </tr>
                    `).join('')}
                </table>
                <p><a href="/">← Go to Website</a></p>
            </body>
            </html>
        `;
        res.send(html);
    });
});

// Serve the frontend
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

app.listen(PORT, () => {
    console.log(`Server is running on http://localhost:${PORT}`);
});
