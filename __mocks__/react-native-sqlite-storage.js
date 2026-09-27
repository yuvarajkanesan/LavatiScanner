const mockDb = {
  executeSql: jest.fn(() => Promise.resolve([{rows: {length: 0, item: () => ({}), raw: () => []}}])),
  transaction: jest.fn(cb => cb({executeSql: jest.fn()})),
  close: jest.fn(() => Promise.resolve()),
};

module.exports = {
  DEBUG: jest.fn(),
  enablePromise: jest.fn(),
  openDatabase: jest.fn(() => Promise.resolve(mockDb)),
};
