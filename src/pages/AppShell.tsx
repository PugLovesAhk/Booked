import { Link, NavLink, Outlet } from 'react-router-dom';
import { GearIcon, ListIcon, LogoMark, PlusIcon } from '../components/Icons';
import { useData } from '../lib/data';
import { hasAccess, isSubscribed, trialDaysLeft } from '../lib/format';
import { useLayout } from '../lib/layout';

function Banner() {
  const { profile, demo } = useData();
  if (demo) {
    return (
      <div className="banner">
        <strong>Admin demo account.</strong> No texts are sent.
      </div>
    );
  }
  if (!profile || isSubscribed(profile)) return null;
  if (!hasAccess(profile)) {
    return (
      <div className="banner banner-alert" role="alert">
        <strong>Your free trial has ended.</strong> <Link to="/settings#plan">Add a payment method</Link> to keep sending quotes.
      </div>
    );
  }
  const days = trialDaysLeft(profile);
  if (days > 7) return null;
  return (
    <div className="banner">
      <strong>{days} day{days === 1 ? '' : 's'} left in your free trial.</strong> <Link to="/settings#plan">Add a payment method</Link>
    </div>
  );
}

function Brand({ sub }: { sub?: string }) {
  return (
    <Link to="/quotes" className="brand">
      <LogoMark />
      <span className="brand-text">
        <span className="brand-name">Booked</span>
        {sub && <span className="brand-sub">{sub}</span>}
      </span>
    </Link>
  );
}

export function AppShell() {
  const layout = useLayout();
  const { profile, summary, demo } = useData();

  if (layout === 'desktop') {
    return (
      <div className="shell shell-desktop">
        <aside className="sidebar">
          <Brand />
          <Link to="/new" className="btn btn-primary"><PlusIcon /> New quote</Link>
          <nav className="side-nav" aria-label="Main">
            <NavLink to="/quotes"><ListIcon /> Quotes {summary.waiting > 0 && <span className="side-count" title="Waiting">{summary.waiting}</span>}</NavLink>
            <NavLink to="/settings"><GearIcon /> Settings</NavLink>
          </nav>
          <div className="sidebar-foot">
            <strong>{profile?.business_name || 'Your business'}</strong>
            <span>{demo ? 'Admin demo' : 'Owner'}</span>
          </div>
        </aside>
        <div className="main">
          <Banner />
          <Outlet />
        </div>
      </div>
    );
  }

  if (layout === 'tablet') {
    return (
      <div className="shell shell-tablet">
        <header className="topbar">
          <Brand sub={profile?.business_name} />
          <nav className="top-nav" aria-label="Main">
            <NavLink to="/quotes"><ListIcon /> Quotes</NavLink>
            <NavLink to="/settings"><GearIcon /> Settings</NavLink>
            <NavLink to="/new" className="btn btn-primary"><PlusIcon /> New quote</NavLink>
          </nav>
        </header>
        <Banner />
        <div className="main">
          <Outlet />
        </div>
      </div>
    );
  }

  return (
    <div className="shell shell-phone">
      <Banner />
      <div className="main">
        <Outlet />
      </div>
      <nav className="tabbar" aria-label="Main">
        <NavLink to="/quotes" className="tab"><ListIcon /><span>Quotes</span></NavLink>
        <NavLink to="/new" className="tab tab-new"><PlusIcon /><span>New quote</span></NavLink>
        <NavLink to="/settings" className="tab"><GearIcon /><span>Settings</span></NavLink>
      </nav>
    </div>
  );
}
