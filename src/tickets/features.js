/**
 * Catalogue des fonctionnalités activables.
 *
 * Source unique pour le panneau de configuration : ajouter une entrée ici
 * suffit à faire apparaître son interrupteur dans +setup. La clé doit exister
 * dans DEFAULTS.features (core/settings.js).
 *
 * `group` range l'interrupteur dans la page « Ouverture » ou « Fermeture ».
 * `description` peut être une fonction des réglages, pour afficher une valeur.
 */
export const FEATURES = [
	{
		key: 'claim',
		group: 'open',
		label: 'Prise en charge',
		description: () => 'Le staff peut revendiquer un ticket, son nom s\'affiche dans le ticket.'
	},
	{
		key: 'pingStaff',
		group: 'open',
		label: 'Mention du staff',
		description: () => 'Les rôles staff sont mentionnés à l\'ouverture d\'un ticket.'
	},
	{
		key: 'questions',
		group: 'open',
		label: 'Formulaire d\'ouverture',
		description: () => 'Pose les questions de la catégorie avant de créer le ticket.'
	},
	{
		key: 'ticketLimit',
		group: 'open',
		label: 'Limite par membre',
		description: (s) => `Au plus **${s.maxTickets}** ticket${s.maxTickets > 1 ? 's' : ''} ouvert${s.maxTickets > 1 ? 's' : ''} en même temps par membre.`
	},
	{
		key: 'closeConfirm',
		group: 'close',
		label: 'Confirmation',
		description: () => 'Demande une confirmation avant de fermer un ticket.'
	},
	{
		key: 'closeReason',
		group: 'close',
		label: 'Raison de fermeture',
		description: () => 'Ouvre un formulaire pour indiquer pourquoi le ticket est fermé.'
	},
	{
		key: 'memberClose',
		group: 'close',
		label: 'Fermeture par le membre',
		description: () => 'L\'auteur du ticket peut le fermer lui-même.'
	},
	{
		key: 'archive',
		group: 'close',
		label: 'Archivage',
		description: () => 'Un ticket fermé est verrouillé et peut être rouvert. Désactivé : il est supprimé.'
	},
	{
		key: 'transcript',
		group: 'close',
		label: 'Transcription',
		description: () => 'Archive la conversation en HTML dans le salon des transcriptions.'
	},
	{
		key: 'transcriptDM',
		group: 'close',
		label: 'Transcription en privé',
		description: () => 'Envoie aussi la transcription à l\'auteur du ticket.'
	},
	{
		key: 'rating',
		group: 'close',
		label: 'Avis',
		description: () => 'Demande à l\'auteur une note de 1 à 5 après la fermeture.'
	},
	{
		key: 'autoClose',
		group: 'close',
		label: 'Fermeture automatique',
		description: (s) => `Ferme les tickets sans nouveau message depuis **${s.autoCloseHours} h**.`
	}
];

export const featureByKey = (key) => FEATURES.find((f) => f.key === key);
