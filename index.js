/**
 * @format
 */

import 'react-native-gesture-handler';
import {Buffer} from 'buffer';
import {AppRegistry} from 'react-native';
import {registerWidgetTaskHandler} from 'react-native-android-widget';
import App from './App';
import {name as appName} from './app.json';
import {ScanWidgetDark, ScanWidgetLight} from './src/widgets/ScanWidget';

global.Buffer = global.Buffer || Buffer;

AppRegistry.registerComponent(appName, () => App);

registerWidgetTaskHandler(async ({renderWidget}) => {
  renderWidget({light: <ScanWidgetLight />, dark: <ScanWidgetDark />});
});
