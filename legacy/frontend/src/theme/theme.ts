import { createTheme } from '@mui/material/styles';

export const theme = createTheme({
  cssVariables: { colorSchemeSelector: 'class' },
  colorSchemes: {
    light: {
      palette: {
        primary: { main: '#1F6FEB', contrastText: '#FFFFFF' },
        secondary: { main: '#7B5BCC', contrastText: '#FFFFFF' },
        success: { main: '#1F8E3D' },
        warning: { main: '#B5651D' },
        error: { main: '#B3261E' },
        background: { default: '#F7F8FB', paper: '#FFFFFF' },
        text: { primary: '#1B1F24', secondary: '#5A6473' }
      }
    },
    dark: {
      palette: {
        primary: { main: '#9DC1FF', contrastText: '#0A2540' },
        secondary: { main: '#C5B3FF', contrastText: '#1B1330' },
        success: { main: '#7CD992' },
        warning: { main: '#F5B97A' },
        error: { main: '#F2B8B5' },
        background: { default: '#101319', paper: '#1A1E26' },
        text: { primary: '#E6E8EC', secondary: '#B0B6C0' }
      }
    }
  },
  shape: { borderRadius: 16 },
  typography: {
    fontFamily: '"Roboto Flex", "Roboto", "Helvetica", "Arial", sans-serif',
    h1: { fontWeight: 400, fontSize: '2.5rem', letterSpacing: '-0.5px' },
    h2: { fontWeight: 400, fontSize: '2rem', letterSpacing: '-0.25px' },
    h3: { fontWeight: 500, fontSize: '1.5rem' },
    h4: { fontWeight: 500, fontSize: '1.25rem' },
    h5: { fontWeight: 500, fontSize: '1.125rem' },
    h6: { fontWeight: 500, fontSize: '1rem' },
    button: { textTransform: 'none', fontWeight: 500 }
  },
  components: {
    MuiAppBar: {
      defaultProps: { elevation: 0, color: 'transparent' },
      styleOverrides: {
        root: {
          backdropFilter: 'saturate(180%) blur(8px)',
          borderBottom: '1px solid var(--mui-palette-divider)'
        }
      }
    },
    MuiButton: {
      defaultProps: { disableElevation: true },
      styleOverrides: {
        root: { borderRadius: 999, paddingInline: 20 }
      }
    },
    MuiCard: {
      defaultProps: { elevation: 0 },
      styleOverrides: {
        root: {
          border: '1px solid var(--mui-palette-divider)',
          borderRadius: 24
        }
      }
    },
    MuiDrawer: {
      styleOverrides: {
        paper: { borderRight: '1px solid var(--mui-palette-divider)' }
      }
    }
  }
});
