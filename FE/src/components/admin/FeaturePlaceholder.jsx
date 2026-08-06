import { Wrench } from '@phosphor-icons/react';
import { useTranslation } from 'react-i18next';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

export default function FeaturePlaceholder({ title, description }) {
  const { t } = useTranslation();
  return (
    <Card className="max-w-2xl border-dashed">
      <CardHeader>
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <Wrench size={22} weight="duotone" />
          </div>
          <div>
            <CardTitle>{title}</CardTitle>
            <CardDescription>{description}</CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <Badge variant="muted">{t('admin.placeholder.featureInDevelopment')}</Badge>
        <p className="mt-4 text-sm leading-relaxed text-muted-foreground">
          {t('admin.placeholder.description')}
        </p>
      </CardContent>
    </Card>
  );
}
