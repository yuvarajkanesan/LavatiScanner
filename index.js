/**
 * @format
 */

import 'react-native-gesture-handler';
import {Buffer} from 'buffer';
import {AppRegistry} from 'react-native';
import App from './App';
import {name as appName} from './app.json';

global.Buffer = global.Buffer || Buffer;

AppRegistry.registerComponent(appName, () => App);
