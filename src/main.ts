import { mount } from 'svelte';

import App from './App.svelte';
import './app.css';
import { registerServiceWorker } from './sw-register.js';

const target = document.getElementById('app');
if (!target) throw new Error('missing #app mount point');

registerServiceWorker();

export default mount(App, { target });
