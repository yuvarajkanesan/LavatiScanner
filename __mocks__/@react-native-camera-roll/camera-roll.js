module.exports = {
  CameraRoll: {
    save: jest.fn(() => Promise.resolve('mock://asset')),
    getPhotos: jest.fn(() => Promise.resolve({edges: [], page_info: {has_next_page: false}})),
  },
};
