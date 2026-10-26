import { mount } from 'svelte';
import Admin from './Admin.svelte';

/** The admin panel, /admin on the game server (see server/admin.ts). Not part of the game's own page. */
mount(Admin, { target: document.getElementById('admin')! });
