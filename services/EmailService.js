const nodemailer = require('nodemailer');

// Configure the Zoho ZeptoMail transporter
// It's good practice to use environment variables for sensitive data like API keys.
const ZOHO_SMTP_HOST = process.env.ZOHO_SMTP_HOST || "smtp.zeptomail.in";
const ZOHO_SMTP_PORT = process.env.ZOHO_SMTP_PORT || 587;
const ZOHO_EMAIL_API_KEY = process.env.ZOHO_EMAIL_API_KEY; // Your Email API Key from ZeptoMail
const ZOHO_SENDER_EMAIL = process.env.ZOHO_SENDER_EMAIL; // Your verified sender email address
const ZOHO_SENDER_NAME = process.env.ZOHO_SENDER_NAME || "Your App Name"; // Default sender name

// Create a transporter object
let transporter;

if (ZOHO_EMAIL_API_KEY && ZOHO_SENDER_EMAIL) {
    transporter = nodemailer.createTransport({
        host: ZOHO_SMTP_HOST,
        port: parseInt(ZOHO_SMTP_PORT, 10),
        secure: parseInt(ZOHO_SMTP_PORT, 10) === 465, // true for 465, false for other ports like 587
        auth: {
            user: "emailapikey", // This is a literal string as per Zoho ZeptoMail's Email API Key method
            pass: ZOHO_EMAIL_API_KEY,
        },
    });
} else {
    console.warn(
        "⚠️ Zoho ZeptoMail API key or Sender Email not configured. Email service will not be functional."
    );
    console.warn("Please set ZOHO_EMAIL_API_KEY and ZOHO_SENDER_EMAIL environment variables.");
}

/**
 * Sends an email using Zoho ZeptoMail.
 *
 * @param {string} to - The recipient's email address.
 * @param {string} subject - The subject of the email.
 * @param {string} html - The HTML content of the email.
 * @param {string} [text] - Optional plain text content for the email.
 * @returns {Promise<object>} A promise that resolves with the info object from Nodemailer or rejects with an error.
 */
const sendEmail = async (to, subject, html, text) => {
    if (!transporter) {
        return Promise.reject(new Error("Email transporter is not configured."));
    }

    const mailOptions = {
        from: `"${ZOHO_SENDER_NAME}" <${ZOHO_SENDER_EMAIL}>`,
        to: to, // Recipient email address
        subject: subject, // Subject line
        html: html, // HTML body
        ...(text && { text: text }), // Optional plain text body
    };

    try {
        const info = await transporter.sendMail(mailOptions);
        console.log(`📧 Email sent successfully to ${to}: ${info.messageId}`);
        return info;
    } catch (error) {
        console.error(`Error sending email to ${to}:`, error);
        throw error; // Re-throw the error to be caught by the caller
    }
};

const sendOtpEmail = async (to, otp) => {
    await sendEmail(to, "Your OTP for RocketShop", `<p>Your OTP for RocketShop is ${otp}. It is valid for 10 minutes. Do not share with anyone.</p>`)
}


module.exports = {
    sendEmail,
    sendOtpEmail
};