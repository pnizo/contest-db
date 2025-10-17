const BaseModel = require('./BaseModel');

class Contest extends BaseModel {
  constructor() {
    super('Contests');
  }

  // Override findAll to skip isValid filtering since Contests sheet doesn't have isValid column
  async findAll() {
    try {
      await this.ensureInitialized();
      const values = await this.getSheetsService().getValues(`${this.sheetName}!A:AD`);
      if (values.length === 0) return [];

      const headers = values[0];
      const data = values.slice(1);

      const allItems = data.map((row, index) => {
        const obj = { _rowIndex: index + 2 };
        headers.forEach((header, i) => {
          obj[header] = row[i] || '';
        });
        return obj;
      });

      // Don't filter by isValid for Contests sheet - return all items
      return allItems;
    } catch (error) {
      console.error('Error in findAll:', error);
      return [];
    }
  }

  async findByName(contestName) {
    const all = await this.findAll();
    return all.find(contest => contest.contest_name === contestName);
  }

  async findByDateRange(startDate, endDate) {
    const all = await this.findAll();
    return all.filter(contest => {
      if (!contest.contest_date) return false;
      const contestDate = new Date(contest.contest_date);
      const start = new Date(startDate);
      const end = new Date(endDate);
      return contestDate >= start && contestDate <= end;
    });
  }

  // 開催日順にソートされたコンテスト一覧を取得
  async findAllSorted(order = 'desc') {
    const all = await this.findAll();
    return all.sort((a, b) => {
      const dateA = new Date(a.contest_date);
      const dateB = new Date(b.contest_date);
      return order === 'desc' ? dateB - dateA : dateA - dateB;
    });
  }

  // 今日以降のコンテストを取得
  async findUpcoming() {
    const all = await this.findAll();
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    return all
      .filter(contest => {
        if (!contest.contest_date) return false;
        const contestDate = new Date(contest.contest_date);
        return contestDate >= today;
      })
      .sort((a, b) => new Date(a.contest_date) - new Date(b.contest_date));
  }
}

module.exports = Contest;
