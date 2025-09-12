const { google } = require('googleapis');
require('dotenv').config();

class SheetsService {
  constructor() {
    this.spreadsheetId = process.env.GOOGLE_SHEETS_SPREADSHEET_ID;
    this._auth = null;
    this._sheets = null;
  }

  get auth() {
    if (!this._auth) {
      this._auth = new google.auth.GoogleAuth({
        credentials: {
          client_email: process.env.GOOGLE_SHEETS_CLIENT_EMAIL,
          private_key: process.env.GOOGLE_SHEETS_PRIVATE_KEY?.replace(/\\n/g, '\n'),
        },
        scopes: ['https://www.googleapis.com/auth/spreadsheets'],
      });
    }
    return this._auth;
  }

  get sheets() {
    if (!this._sheets) {
      this._sheets = google.sheets({ version: 'v4', auth: this.auth });
    }
    return this._sheets;
  }

  async getValues(range) {
    try {
      const response = await this.sheets.spreadsheets.values.get({
        spreadsheetId: this.spreadsheetId,
        range,
      });
      return response.data.values || [];
    } catch (error) {
      console.error('Error getting values:', error);
      throw error;
    }
  }

  async updateValues(range, values) {
    try {
      const response = await this.sheets.spreadsheets.values.update({
        spreadsheetId: this.spreadsheetId,
        range,
        valueInputOption: 'RAW',
        requestBody: {
          values,
        },
      });
      return response.data;
    } catch (error) {
      console.error('Error updating values:', error);
      throw error;
    }
  }

  async appendValues(range, values) {
    try {
      const response = await this.sheets.spreadsheets.values.append({
        spreadsheetId: this.spreadsheetId,
        range,
        valueInputOption: 'RAW',
        insertDataOption: 'INSERT_ROWS',
        requestBody: {
          values,
        },
      });
      return response.data;
    } catch (error) {
      console.error('Error appending values:', error);
      throw error;
    }
  }

  async deleteRow(sheetName, rowIndex) {
    try {
      const response = await this.sheets.spreadsheets.batchUpdate({
        spreadsheetId: this.spreadsheetId,
        requestBody: {
          requests: [{
            deleteDimension: {
              range: {
                sheetId: 0,
                dimension: 'ROWS',
                startIndex: rowIndex,
                endIndex: rowIndex + 1,
              },
            },
          }],
        },
      });
      return response.data;
    } catch (error) {
      console.error('Error deleting row:', error);
      throw error;
    }
  }
}

module.exports = SheetsService;