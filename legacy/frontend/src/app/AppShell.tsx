import { useMemo } from 'react';
import {
  AppBar,
  Box,
  BottomNavigation,
  BottomNavigationAction,
  Drawer,
  FormControl,
  IconButton,
  InputLabel,
  List,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  MenuItem,
  Paper,
  Select,
  Toolbar,
  Tooltip,
  Typography,
  useColorScheme,
  useMediaQuery
} from '@mui/material';
import { DarkModeOutlined, LightModeOutlined } from '@mui/icons-material';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import type { Theme } from '@mui/material/styles';
import { visibleNavItems } from './navigation';
import { useCurrentEmployee } from './CurrentEmployee';

const drawerWidth = 248;

export function AppShell() {
  const isDesktop = useMediaQuery((t: Theme) => t.breakpoints.up('md'));
  const { current } = useCurrentEmployee();

  const role = current?.role ?? 'Employee';
  const items = useMemo(() => visibleNavItems(role), [role]);
  const bottomItems = useMemo(() => items.filter((i) => i.showInBottomNav), [items]);

  const location = useLocation();
  const activeBottomValue = bottomItems.find((i) => i.to === location.pathname)?.to ?? false;

  return (
    <Box sx={{ display: 'flex', minHeight: '100dvh', bgcolor: 'background.default' }}>
      {isDesktop && (
        <Drawer
          variant="permanent"
          sx={{
            width: drawerWidth,
            flexShrink: 0,
            '& .MuiDrawer-paper': {
              width: drawerWidth,
              boxSizing: 'border-box',
              bgcolor: 'background.paper'
            }
          }}
        >
          <Toolbar sx={{ px: 3 }}>
            <Typography variant="h6" component="span" sx={{ fontWeight: 600 }}>
              BAG-CHRONOS
            </Typography>
          </Toolbar>
          <List sx={{ px: 1.5 }}>
            {items.map(({ to, label, icon: Icon }) => (
              <ListItemButton
                key={to}
                component={NavLink}
                to={to}
                end={to === '/'}
                sx={{
                  borderRadius: 999,
                  mb: 0.5,
                  '&.active': {
                    bgcolor: 'action.selected',
                    color: 'primary.main',
                    '& .MuiListItemIcon-root': { color: 'primary.main' }
                  }
                }}
              >
                <ListItemIcon sx={{ minWidth: 40 }}>
                  <Icon />
                </ListItemIcon>
                <ListItemText primary={label} />
              </ListItemButton>
            ))}
          </List>
        </Drawer>
      )}

      <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
        <AppBar position="sticky" sx={{ bgcolor: 'background.paper' }}>
          <Toolbar sx={{ gap: 2 }}>
            {!isDesktop && (
              <Typography variant="h6" component="span" sx={{ fontWeight: 600 }}>
                BAG-CHRONOS
              </Typography>
            )}
            <Box sx={{ flex: 1 }} />
            <EmployeePicker />
            <ColorSchemeToggle />
          </Toolbar>
        </AppBar>

        <Box
          component="main"
          sx={{
            flex: 1,
            p: { xs: 2, md: 4 },
            pb: { xs: 11, md: 4 },
            maxWidth: 1280,
            width: '100%',
            mx: 'auto'
          }}
        >
          <Outlet />
        </Box>

        {!isDesktop && (
          <Paper
            elevation={3}
            sx={{
              position: 'fixed',
              bottom: 0,
              left: 0,
              right: 0,
              borderRadius: 0,
              borderTop: '1px solid',
              borderColor: 'divider'
            }}
          >
            <BottomNavigation showLabels value={activeBottomValue}>
              {bottomItems.map(({ to, label, icon: Icon }) => (
                <BottomNavigationAction
                  key={to}
                  component={NavLink}
                  to={to}
                  end={to === '/'}
                  value={to}
                  label={label}
                  icon={<Icon />}
                />
              ))}
            </BottomNavigation>
          </Paper>
        )}
      </Box>
    </Box>
  );
}

function EmployeePicker() {
  const { employees, current, setCurrentId, isLoading } = useCurrentEmployee();
  if (isLoading || employees.length === 0) return null;

  return (
    <FormControl size="small" sx={{ minWidth: 220 }}>
      <InputLabel id="current-employee-label">Angemeldet als</InputLabel>
      <Select
        labelId="current-employee-label"
        label="Angemeldet als"
        value={current?.id ?? ''}
        onChange={(e) => setCurrentId(String(e.target.value))}
      >
        {employees.map((e) => (
          <MenuItem key={e.id} value={e.id}>
            {e.firstName} {e.lastName} · {e.role}
          </MenuItem>
        ))}
      </Select>
    </FormControl>
  );
}

function ColorSchemeToggle() {
  const { mode, setMode } = useColorScheme();
  const next = mode === 'dark' ? 'light' : 'dark';
  return (
    <Tooltip title={next === 'dark' ? 'Dunkles Design' : 'Helles Design'}>
      <IconButton onClick={() => setMode(next)} aria-label="Farbschema umschalten">
        {mode === 'dark' ? <LightModeOutlined /> : <DarkModeOutlined />}
      </IconButton>
    </Tooltip>
  );
}
