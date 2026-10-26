import path from 'node:path';
import { fileURLToPath } from 'node:url';

/** Dossier d'un module ESM, correct même si le chemin contient des espaces ou des accents. */
export const dirnameOf = (moduleUrl: string) => path.dirname(fileURLToPath(moduleUrl));

/** Dossier `content/` à la racine du projet (fonctionne depuis src/ et dist/). */
export const contentDir = path.resolve(dirnameOf(import.meta.url), '../../content');
