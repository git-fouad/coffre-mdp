import { render } from 'preact';
import '@fontsource/atkinson-hyperlegible-next/latin-400.css';
import '@fontsource/atkinson-hyperlegible-next/latin-700.css';
import '@fontsource/atkinson-hyperlegible-mono/latin-400.css';
import './styles.css';
import { App } from './app.jsx';

render(<App />, document.getElementById('app'));
