import '@fontsource/source-sans-3/latin-400.css';
import '@fontsource/source-sans-3/latin-600.css';
import '@fontsource/source-sans-3/latin-700.css';
import './css/tokens.css';
import './css/base.css';
import './css/components.css';

import { createPinia } from 'pinia';
import { createApp } from 'vue';
import { onUnauthenticated } from '@/api/errors';
import App from '@/App.vue';
import { router } from '@/router';
import { useAuthStore } from '@/stores/auth';
import { useReferenceStore } from '@/stores/reference';
import { installExternalLinkGuard } from '@/utils/externalLinks';
import { applyTheme, rememberedTheme } from '@/utils/themes';

// Theme of the previous opening at once, the team's one once the data is read (AppLayout).
applyTheme(rememberedTheme());

const app = createApp(App);
const pinia = createPinia();

app.use(pinia);
app.use(router);

// Signed-out elsewhere or account deactivated: back to the sign-in screen.
onUnauthenticated(() => {
    useAuthStore(pinia).clear();
    useReferenceStore(pinia).reset();

    const current = router.currentRoute.value;
    if (current.name !== 'login' && current.name !== 'connect') {
        void router.push({ name: 'login', query: { redirect: current.fullPath } });
    }
});

// Functional requirement: external links always open in a new tab.
installExternalLinkGuard();

app.mount('#app');
