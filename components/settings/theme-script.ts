// The stored theme, applied before paint so a chosen theme never flashes the other one.

export const THEME_KEY = "cadmium-theme";

export const THEME_SCRIPT = `try{var t=localStorage.getItem("${THEME_KEY}");if(t==="light"||t==="dark")document.documentElement.dataset.theme=t}catch(e){}`;
