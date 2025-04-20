require('dotenv').config();
const { Buffer } = require('buffer');

class SMSService {
    constructor() {
        this.authKey = process.env.SMS_COUNTRY_AUTH_KEY;
        this.authToken = process.env.SMS_COUNTRY_AUTH_TOKEN;
        this.senderId = process.env.SMS_COUNTRY_SENDER_ID;
        const baseUrl = 'https://restapi.smscountry.com/v0.1/Accounts';
        this.apiEndpoint = `${baseUrl}/${process.env.SMS_COUNTRY_AUTH_KEY}/SMSes/`;
    }

    async sendSMS(phoneNumber, message) {
        if (!phoneNumber || !message) {
            throw new Error('Phone number and message text are required');
        }

        const credentials = `${this.authKey}:${this.authToken}`;
        const base64Credentials = Buffer.from(credentials).toString('base64');

        const requestBody = {
            Text: message,
            Number: phoneNumber,
            SenderId: this.senderId,
            DRNotifyUrl: process.env.SMS_CALLBACK_URL || '',
            DRNotifyHttpMethod: "POST",
            Tool: "API"
        };

        try {
            const response = await fetch(this.apiEndpoint, {
                method: 'POST',
                headers: {
                    'Authorization': `Basic ${base64Credentials}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(requestBody)
            });

            const responseData = await response.json();

            // Check HTTP status code
            if (response.status < 200 || response.status >= 300) {
                throw new Error(`HTTP error! status: ${response.status}, message: ${JSON.stringify(responseData)}`);
            }

            console.log('SMS sent successfully', responseData);
            // If Success is false, throw an error with the Message
            if (!responseData.Success) {
                throw new Error(responseData.Message || 'SMS sending failed');
            }

            return {
                success: responseData.Success,
                messageId: responseData.MessageUUID,
                apiId: responseData.ApiId,
                message: responseData.Message
            };

        } catch (error) {
            if (error instanceof SyntaxError) {
                // Handle JSON parsing errors
                throw new Error('Invalid JSON response from SMS API');
            }
            console.error('SMS sending failed:', error);
            throw new Error('Failed to send SMS: ' + error.message);
        }
    }
}

const smsService = new SMSService();
module.exports = smsService;