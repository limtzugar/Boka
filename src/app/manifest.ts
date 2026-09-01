import type { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'BOKA — Domowy Asystent AI',
    short_name: 'BOKA',
    description: 'Inteligentny asystent domowy z pamięcią o rodzinie, głosem po polsku i pikselową twarzą.',
    start_url: '/',
    display: 'standalone',
    background_color: '#0a0a0f',
    theme_color: '#00f5d4',
    orientation: 'any',
    categories: ['utilities', 'productivity'],
    icons: [
      {
        src: '/favicon.svg',
        sizes: 'any',
        type: 'image/svg+xml',
        purpose: 'any',
      },
      {
        src: '/boka-icon-192.png',
        sizes: '192x192',
        type: 'image/png',
      },
      {
        src: '/boka-icon-512.png',
        sizes: '512x512',
        type: 'image/png',
      },
    ],
    shortcuts: [
      {
        name: 'Widget BOKA',
        short_name: 'Widget',
        url: '/widget',
        description: 'Kompaktowy widżet z twarzą BOKI',
      },
    ],
  };
}
