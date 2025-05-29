import { createRouter, createWebHistory, type RouteRecordRaw } from 'vue-router';
import GeneralOptions from '@/components/options/GeneralOptions.vue';
import BannerOptions from '@/components/options/BannerOptions.vue';

const routes: RouteRecordRaw[] = [
  {
    path: '/',
    redirect: '/general',
  },
  {
    path: '/general',
    component: GeneralOptions,
  },
  {
    path: '/banner',
    component: BannerOptions,
  },
];

const router = createRouter({
  history: createWebHistory(),
  routes,
});

export default router;
