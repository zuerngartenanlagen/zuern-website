// The walk (index.html). Order matters: ES modules evaluate in import order.
import './scrollcraft.js';
import { lenis } from './boot.ts';
import './garden.js';
import './walk.js';
import { initSteps } from './steps.ts';
import { initPhases } from './phases.ts';

initSteps(lenis);
initPhases();
