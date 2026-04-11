const nodemailer = require('nodemailer');

export default async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ message: 'Method not allowed' });
    }

    const { name, phone, email, message } = req.body;

    // SMTP Configuration from Environment Variables
    const transporter = nodemailer.createTransport({
        service: 'gmail',
        auth: {
            user: process.env.EMAIL_USER,
            pass: process.env.EMAIL_PASS
        }
    });

    const mailOptions = {
        from: process.env.EMAIL_USER,
        to: process.env.EMAIL_USER,
        subject: `[Vercel Site] New Submission from ${name}`,
        text: `
            New message received (Vercel):
            Name: ${name}
            Phone: ${phone}
            Email: ${email}
            Message: ${message}
        `
    };

    try {
        await transporter.sendMail(mailOptions);
        // Note: SQLite is skipped on Vercel as it is stateless.
        // For database persistence on Vercel, consider using Supabase, MongoDB, or PlanetScale.
        return res.status(200).json({ 
            success: true, 
            message: 'Message sent successfully!' 
        });
    } catch (error) {
        console.error('Email error:', error);
        return res.status(500).json({ 
            success: false, 
            message: 'Email delivery failed. Error: ' + error.message 
        });
    }
}
