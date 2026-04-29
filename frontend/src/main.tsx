import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { CssBaseline, ThemeProvider, getInitColorSchemeScript } from '@mui/material';
import { BrowserRouter } from 'react-router-dom';
import { App } from './App';
import { theme } from './theme/theme';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {getInitColorSchemeScript({ attribute: 'class' })}
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </ThemeProvider>
  </StrictMode>
);
