module.exports = {
  accelerometer: {
    subscribe: jest.fn(() => ({unsubscribe: jest.fn()})),
  },
  setUpdateIntervalForType: jest.fn(),
  SensorTypes: {accelerometer: 'accelerometer'},
};
