import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

interface PlaceholderPageProps {
  title: string;
  hint?: string;
}

export function PlaceholderPage({ title, hint }: PlaceholderPageProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        {hint && <CardDescription>{hint}</CardDescription>}
      </CardHeader>
      <CardContent className="text-sm text-muted-foreground">
        Diese Seite wird im Rahmen der laufenden Migration nach OpenClockwork in einem späteren
        Schritt portiert. Die alte Implementierung steht unter <code>legacy/frontend/</code> als
        Referenz bereit.
      </CardContent>
    </Card>
  );
}
