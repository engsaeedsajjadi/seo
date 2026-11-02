// Runs before the app. External so the page can use a strict Content-Security-Policy.
      // Set Persian as default, RTL direction
      (function () {
        const isInIframe = window.self !== window.top;

        function applyThemeToDOM(theme) {
          document.documentElement.classList.remove("light", "dark");
          document.documentElement.classList.add(theme);
          document.documentElement.setAttribute("data-theme", theme);
          // Ensure RTL and Persian lang are set
          document.documentElement.setAttribute("lang", "fa");
          document.documentElement.setAttribute("dir", "rtl");
        }

        if (isInIframe) {
          window.addEventListener("message", function (event) {
            if (event.data && typeof event.data.theme === "string") {
              const theme = event.data.theme;
              if (theme === "light" || theme === "dark") {
                applyThemeToDOM(theme);
              }
            }
          });
        } else {
          // Default dark theme for RankForge
          applyThemeToDOM("dark");
        }
        
        // Always ensure RTL
        document.documentElement.setAttribute("lang", "fa");
        document.documentElement.setAttribute("dir", "rtl");
      })();
