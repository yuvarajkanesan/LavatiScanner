module.exports = {
  __esModule: true,
  default: {
    pick: jest.fn(() => Promise.resolve([])),
    pickSingle: jest.fn(() => Promise.resolve({})),
    isCancel: jest.fn(() => false),
  },
  types: {allFiles: '*/*', images: 'image/*', pdf: 'application/pdf'},
  isCancel: jest.fn(() => false),
};
