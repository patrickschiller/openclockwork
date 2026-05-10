import { Card, CardContent, Stack, Typography } from '@mui/material';

interface Props {
  title: string;
  hint: string;
}

export function PlaceholderPage({ title, hint }: Props) {
  return (
    <Stack spacing={3}>
      <Typography variant="h1">{title}</Typography>
      <Card>
        <CardContent>
          <Typography variant="body1" color="text.secondary">
            {hint}
          </Typography>
        </CardContent>
      </Card>
    </Stack>
  );
}
