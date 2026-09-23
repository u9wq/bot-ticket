import { helpView } from '#core/help.js';

export default {
	namespace: 'help',
	actions: {
		group: (i, { settings }) => i.update(helpView(settings, i.values[0]))
	}
};
