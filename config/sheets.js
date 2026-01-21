const { google } = require('googleapis');
require('dotenv').config();

class SheetsService {
  constructor() {
    this.spreadsheetId = process.env.CONTEST_DB_SPREADSHEET_ID;
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

  async clearValues(range) {
    try {
      const response = await this.sheets.spreadsheets.values.clear({
        spreadsheetId: this.spreadsheetId,
        range,
      });
      return response.data;
    } catch (error) {
      console.error('Error clearing values:', error);
      throw error;
    }
  }


  // シートの存在確認
  async sheetExists(sheetTitle) {
    try {
      const response = await this.sheets.spreadsheets.get({
        spreadsheetId: this.spreadsheetId,
      });
      
      const sheets = response.data.sheets || [];
      return sheets.some(sheet => sheet.properties.title === sheetTitle);
    } catch (error) {
      console.error('Error checking sheet existence:', error);
      throw error;
    }
  }

  // 新しいシートを作成
  async createSheet(sheetTitle) {
    try {
      // 既に存在する場合はエラー
      if (await this.sheetExists(sheetTitle)) {
        throw new Error(`シート「${sheetTitle}」は既に存在します`);
      }

      const response = await this.sheets.spreadsheets.batchUpdate({
        spreadsheetId: this.spreadsheetId,
        requestBody: {
          requests: [{
            addSheet: {
              properties: {
                title: sheetTitle,
              },
            },
          }],
        },
      });

      return response.data.replies[0].addSheet.properties;
    } catch (error) {
      console.error('Error creating sheet:', error);
      throw error;
    }
  }

  // シートにデータを書き込み（ヘッダー付き）
  async writeToSheet(sheetTitle, headers, rows) {
    try {
      // シートが存在しない場合は作成
      if (!await this.sheetExists(sheetTitle)) {
        await this.createSheet(sheetTitle);
      } else {
        // 既存のシートをクリア
        await this.clearValues(`${sheetTitle}!A:Z`);
      }

      // ヘッダー + データを結合
      const values = [headers, ...rows];

      const response = await this.sheets.spreadsheets.values.update({
        spreadsheetId: this.spreadsheetId,
        range: `${sheetTitle}!A1`,
        valueInputOption: 'RAW',
        requestBody: {
          values,
        },
      });

      return response.data;
    } catch (error) {
      console.error('Error writing to sheet:', error);
      throw error;
    }
  }


  // Ordersシートから全データを取得
  async getOrdersData() {
    try {
      const values = await this.getValues('Orders!A:Z');
      if (values.length === 0) return [];

      const headers = values[0];
      const data = values.slice(1);

      return data.map(row => {
        const obj = {};
        headers.forEach((header, i) => {
          obj[header] = row[i] || '';
        });
        return obj;
      });
    } catch (error) {
      console.error('Error getting Orders data:', error);
      throw error;
    }
  }
}

module.exports = SheetsService;