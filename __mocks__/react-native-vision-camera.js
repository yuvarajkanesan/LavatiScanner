const React = require('react');

const Camera = React.forwardRef((_props, ref) => {
  React.useImperativeHandle(ref, () => ({
    takePhoto: jest.fn(() => Promise.resolve({path: '/mock/photo.jpg'})),
  }));
  return null;
});

module.exports = {
  Camera,
  useCameraDevice: jest.fn(() => ({id: 'mock-device'})),
  useCameraPermission: jest.fn(() => ({
    hasPermission: true,
    requestPermission: jest.fn(() => Promise.resolve(true)),
  })),
};
