import { useState } from 'react';
import { NavLink } from 'react-router-dom';
import { List, SignOut } from '@phosphor-icons/react';
import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import LanguageSwitcher from '@/components/shared/LanguageSwitcher';

/**
 * Sidebar tái sử dụng cho Admin, Manager, Staff (cùng UI, khác menuItems).
 *
 * @param {Object} props
 * @param {{ name: string, tagline?: string, logo?: React.ReactNode }} props.brand
 * @param {{ id: string, label: string, to: string, icon: React.ComponentType, end?: boolean }[]} props.menuItems
 * @param {{ name: string, roleLabel?: string }} props.user
 * @param {() => void} props.onLogout
 * @param {string} [props.className]
 */
export default function DashboardSidebar({ brand, menuItems, user, onLogout, className, badges = {} }) {
  const [collapsed, setCollapsed] = useState(false);
  const { t } = useTranslation();

  return (
    <aside
      className={cn(
        'sticky top-0 flex h-screen min-h-0 shrink-0 flex-col border-r border-sidebar-border bg-sidebar text-sidebar-foreground transition-all duration-200',
        collapsed ? 'w-[64px]' : 'w-[272px]',
        className,
      )}
    >
      <div className={cn('flex items-center px-5 py-5', collapsed ? 'justify-center' : 'gap-3')}>
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
          {brand.logo ?? (
            <span className="text-lg font-bold tracking-tight" aria-hidden>AW</span>
          )}
        </div>
        {!collapsed && (
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold leading-tight">{brand.name}</p>
            {brand.tagline ? (
              <p className="truncate text-xs text-muted-foreground">{brand.tagline}</p>
            ) : null}
          </div>
        )}
        <button
          type="button"
          onClick={() => setCollapsed((c) => !c)}
          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-muted-foreground hover:bg-accent hover:text-accent-foreground transition-colors"
          aria-label={collapsed ? t('sidebar.expand') : t('sidebar.collapse')}
          title={collapsed ? t('sidebar.expand') : t('sidebar.collapse')}
        >
          <List size={16} weight="bold" />
        </button>
      </div>

      <Separator />

      <nav className="flex-1 space-y-0.5 overflow-y-auto px-3 py-4" aria-label={t('sidebar.mainMenu')}>
        {menuItems.map((item) => {
          const Icon = item.icon;
          const count = badges[item.id] || 0;
          const itemLabel = t(`menu.${item.id}`, item.label);
          return (
            <NavLink
              key={item.id}
              to={item.to}
              end={item.end ?? false}
              className={({ isActive }) =>
                cn(
                  'relative flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors',
                  collapsed ? 'justify-center px-0' : '',
                  isActive
                    ? 'bg-sidebar-accent text-sidebar-accent-foreground'
                    : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground',
                )
              }
              title={collapsed ? itemLabel : undefined}
            >
              <span className="relative shrink-0">
                <Icon size={20} weight="duotone" aria-hidden />
                {count > 0 && collapsed && (
                  <span className="absolute -right-1.5 -top-1.5 h-2.5 w-2.5 rounded-full bg-red-500 ring-2 ring-sidebar" aria-hidden />
                )}
              </span>
              {!collapsed && <span className="truncate">{itemLabel}</span>}
              {!collapsed && count > 0 && (
                <span className="ml-auto inline-flex min-w-[20px] items-center justify-center rounded-full bg-red-500 px-1.5 py-0.5 text-[11px] font-bold text-white"
                  title={`${count} ${t('sidebar.new_items')}`}>
                  {count > 99 ? '99+' : count}
                </span>
              )}
            </NavLink>
          );
        })}
      </nav>

      <div className="mt-auto shrink-0 border-t border-sidebar-border">
        <div className={cn('flex items-center px-4 py-4', collapsed ? 'flex-col gap-2 justify-center' : 'gap-2')}>
          {!collapsed && (
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">{user.name}</p>
              {user.roleLabel ? (
                <p className="truncate text-xs text-muted-foreground">{user.roleLabel}</p>
              ) : null}
            </div>
          )}
          
          {/* Nút chuyển đổi ngôn ngữ đặt ngay cạnh nút Đăng xuất */}
          <LanguageSwitcher isCompact={collapsed} isLightBg={false} />

          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="shrink-0 text-muted-foreground hover:text-destructive"
            onClick={onLogout}
            aria-label={t('sidebar.logout')}
            title={t('sidebar.logout')}
          >
            <SignOut size={20} weight="bold" />
          </Button>
        </div>
      </div>

    </aside>
  );
}
