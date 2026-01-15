import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import svgr from "vite-plugin-svgr";

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    svgr({
      svgrOptions: {
        icon: true,
        // This will transform your SVG to a React component
        exportType: "named",
        namedExport: "ReactComponent",
      },
    }),
  ],
  server: {
    proxy: {
      "/api": {
        target: "http://label.land:5174",
        changeOrigin: true,
        secure: false,
        // Force HTTP/1.1 to prevent QUIC protocol errors
        configure: (proxy, _options) => {
          proxy.on("proxyReq", (proxyReq) => {
            // Remove any Alt-Svc headers that might trigger QUIC
            proxyReq.removeHeader("alt-svc");
            proxyReq.removeHeader("Alt-Svc");
            // Force HTTP/1.1
            proxyReq.setHeader("Connection", "keep-alive");
          });
        },
      },
    },
  },
});
