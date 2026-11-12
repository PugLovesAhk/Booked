import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { BackIcon, CheckIcon, PlusIcon, XIcon } from '../components/Icons';
import { QuoteDetail } from '../components/QuoteDetail';
import { QuoteList, SearchBox, matches } from '../components/QuoteList';
import { QuoteTable } from '../components/QuoteTable';
import { Summary, type Filter } from '../components/Summary';
import { useData } from '../lib/data';
import { useLayout } from '../lib/layout';

// Remember search + filter while moving between the list and a quote.
const memory = { search: '', filter: 'all' as Filter };

function useListState() {
  const [search, setSearch] = useState(memory.search);
  const [filter, setFilter] = useState<Filter>(memory.filter);
  useEffect(() => {
    memory.search = search;
    memory.filter = filter;
  }, [search, filter]);
  return { search, setSearch, filter, setFilter };
}

function FilterChips({ filter, onFilter }: { filter: Filter; onFilter: (f: Filter) => void }) {
  const items: [Filter, string][] = [['all', 'All'], ['waiting', 'Waiting'], ['booked', 'Booked'], ['declined', 'Declined']];
  return (
    <div className="chips" role="group" aria-label="Filter by status">
      {items.map(([f, label]) => (
        <button key={f} className={`chip${filter === f ? ' active' : ''}`} onClick={() => onFilter(f)} aria-pressed={filter === f}>
          {label}
        </button>
      ))}
    </div>
  );
}

function EmptyStart() {
  return (
    <div className="empty-start">
      <div className="empty-check"><CheckIcon /></div>
      <h2>Send your first quote</h2>
      <p>Add a quote and Booked texts it to your customer, then follows up on day 2, 5 and 10 until they answer.</p>
      <Link to="/new" className="btn btn-primary btn-lg"><PlusIcon /> New Quote</Link>
    </div>
  );
}

export function QuotesPage() {
  const layout = useLayout();
  const { id } = useParams();
  const navigate = useNavigate();
  const { quotes, loading } = useData();
  const { search, setSearch, filter, setFilter } = useListState();

  const visible = useMemo(() => quotes.filter((q) => matches(q, search, filter)), [quotes, search, filter]);
  const selected = id ? quotes.find((q) => q.id === id) : undefined;
  const emptyText = search || filter !== 'all' ? 'No quotes match.' : 'No quotes yet.';
  const backToList = () => navigate('/quotes', { replace: layout !== 'phone' });

  useEffect(() => {
    if (layout !== 'desktop' || !id) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && navigate('/quotes');
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [layout, id, navigate]);

  if (loading) return <div className="loading" aria-busy="true">Loading quotes…</div>;

  const notFound = id && !selected ? <p className="empty">That quote was deleted or doesn’t exist.</p> : null;

  // ---------- Phone: list, or one quote full screen ----------
  if (layout === 'phone') {
    if (id) {
      return (
        <div className="page">
          <div className="page-bar">
            <button className="btn-back" onClick={() => navigate('/quotes')}><BackIcon /> Quotes</button>
          </div>
          {selected ? <QuoteDetail quote={selected} onDeleted={backToList} /> : notFound}
        </div>
      );
    }
    return (
      <div className="page">
        <h1 className="page-title">Quotes</h1>
        {!quotes.length ? (
          <EmptyStart />
        ) : (
          <>
            <Summary filter={filter} onFilter={setFilter} compact />
            <SearchBox value={search} onChange={setSearch} />
            <FilterChips filter={filter} onFilter={setFilter} />
            <QuoteList quotes={visible} emptyText={emptyText} />
          </>
        )}
      </div>
    );
  }

  // ---------- Tablet: list on the left, quote on the right ----------
  if (layout === 'tablet') {
    return (
      <div className="split">
        <section className="split-list">
          <Summary filter={filter} onFilter={setFilter} compact />
          <SearchBox value={search} onChange={setSearch} />
          <FilterChips filter={filter} onFilter={setFilter} />
          {quotes.length ? <QuoteList quotes={visible} selectedId={id} emptyText={emptyText} /> : <p className="empty">No quotes yet.</p>}
        </section>
        <section className="split-detail">
          {selected ? (
            <QuoteDetail key={selected.id} quote={selected} onDeleted={backToList} />
          ) : notFound ? (
            notFound
          ) : quotes.length ? (
            <div className="placeholder">Tap a quote to see the details.</div>
          ) : (
            <EmptyStart />
          )}
        </section>
      </div>
    );
  }

  // ---------- Computer: summary boxes + sortable, searchable table ----------
  return (
    <div className="page page-wide">
      <div className="page-head">
        <h1 className="page-title">Quotes</h1>
        <SearchBox value={search} onChange={setSearch} />
      </div>
      <Summary filter={filter} onFilter={setFilter} />
      {filter !== 'all' && (
        <p className="filter-note">
          Showing {filter} quotes. <button className="link" onClick={() => setFilter('all')}>Show all</button>
        </p>
      )}
      {quotes.length ? <QuoteTable quotes={visible} selectedId={id} /> : <EmptyStart />}

      {id && (
        <>
          <div className="drawer-backdrop" onClick={() => navigate('/quotes')} />
          <aside className="drawer" aria-label="Quote details">
            <button className="drawer-close" onClick={() => navigate('/quotes')} aria-label="Close"><XIcon /></button>
            {selected ? <QuoteDetail key={selected.id} quote={selected} onDeleted={backToList} /> : notFound}
          </aside>
        </>
      )}
    </div>
  );
}
