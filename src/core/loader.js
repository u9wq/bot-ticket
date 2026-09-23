import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

/** Liste récursivement les fichiers .js d'un dossier. */
export function listFiles(dir) {
	if (!fs.existsSync(dir)) return [];
	return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
		const full = path.join(dir, entry.name);
		if (entry.isDirectory()) return listFiles(full);
		return entry.name.endsWith('.js') ? [full] : [];
	});
}

/**
 * Importe tous les modules d'un dossier et renvoie leurs exports par défaut.
 * pathToFileURL est nécessaire sous Windows : un chemin D:\... n'est pas un
 * specifier valide pour import(). Un module qui échoue est signalé sans
 * empêcher les autres de se charger.
 */
export async function importAll(dir) {
	const modules = [];
	for (const file of listFiles(dir)) {
		try {
			const mod = await import(pathToFileURL(file).href);
			if (mod.default) modules.push({ file, module: mod.default });
		} catch (error) {
			console.error(`[LOADER] échec de ${path.relative(process.cwd(), file)} :`, error);
		}
	}
	return modules;
}
