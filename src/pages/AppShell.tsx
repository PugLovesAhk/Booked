import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { GearIcon, ListIcon, LogoMark, PlusIcon } from '../components/Icons';
import { useData } from '../lib/data';
import { hasAccess, isSubscribed, trialDaysLeft } from '../lib/format';
import { useLayout } from '../lib/layout';

function TrialBanner() {
  const { profile } = useData();
  const navigate = useNavigate();
  if (!profile || isSubscribed(profile)) return null;
  const days = trialDaysLeft(profile);
  if (!hasAccess(profile)) {
    return (
      <button className="banner banner-alert" onClick={() => navigate('/settings#billing')}>
        Your free trial has ended. <u>Add payment to keep sending quotes</u>
      </button>
    );
  }
  if (days > 7) return null;
  return (
    <button className="banner" onClick={() => navigate('/settings#billing')}>
      {days} day{days === 1 ? '' : 's'} left in your free trial. <u>Add payment</u>
    </button>
  );
}

export function AppShell() {
  const layout = useLayout();
  const { profile, summary } = useData();
  const navigate = useNavigate();

  if (layout === 'desktop') {
    return (
      <div className="shell shell-desktop">
        <aside className="sidebar">
          <div className="brand">
            <LogoMark size={34} />
            <div>
              <div className="brand-name">Booked</div>
              <div className="brand-sub">{profile?.business_name}</div>
            </div>
          </div>
          <button className="btn btn-primary btn-block" onClick={() => navigate('/new')}>
            <PlusIcon /> New Quote
          </button>
          <nav className="side-nav">
            <NavLink to="/quotes"><ListIcon /> Quotes {summary.waiting > 0 && <span className="count">{summary.waiting}</span>}</NavLink>
            <NavLink to="/settings"><GearIcon /> Settings</NavLink>
          </nav>
          <div className="sidebar-foot">Turn quotes into booked jobs.</div>
        </aside>
        <div className="main">
          <TrialBanner />
          <Outlet />
        </div>
      </div>
    );
  }

  if (layout === 'tablet') {
    return (
      <div className="shell shell-tablet">
        <header className="topbar">
          <NavLink to="/quotes" className="brand">
            <LogoMark size={36} />
            <span className="brand-name">Booked</span>
          </NavLink>
          <nav className="top-nav">
            <NavLink to="/quotes"><ListIcon /> Quotes</NavLink>
            <NavLink to="/settings"><GearIcon /> Settings</NavLink>
            <NavLink to="/new" className="btn btn-primary"><PlusIcon /> New Quote</NavLink>
          </nav>
        </header>
        <TrialBanner />
        <div className="main">
          <Outlet />
        </div>
      </div>
    );
  }

  return (
    <div className="shell shell-phone">
      <TrialBanner />
      <div className="main">
        <Outlet />
      </div>
      <nav className="tabbar" aria-label="Main">
        <NavLink to="/quotes" className="tab"><ListIcon /><span>Quotes</span></NavLink>
        <NavLink to="/new" className="tab tab-new" aria-label="New Quote">
          <span className="tab-new-circle"><PlusIcon /></span>
          <span>New Quote</span>
        </NavLink>
        <NavLink to="/settings" className="tab"><GearIcon /><span>Settings</span></NavLink>
      </nav>
    </div>
  );
}
