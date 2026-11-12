import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { BackIcon, PlusIcon, XIcon } from '../components/Icons';
import { QuoteDetail } from '../components/QuoteDetail';
import { QuoteList, SearchBox, matches } from '../components/QuoteList';
import { QuoteTable } from '../components/QuoteTable';
import { StatusFilter, Summary, type Filter } from '../components/Summary';
import { useData } from '../lib/data';
import { useLayout } from '../lib/layout';

// Keep search + filter while moving between the list and a quote.
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

function NoQuotes() {
  return (
    <div className="panel empty">
      <p className="empty-title">No quotes yet</p>
      <p>Create a quote and Booked texts it to your customer, then follows up until they answer.</p>
      <Link to="/new" className="btn btn-primary"><PlusIcon /> New quote</Link>
    </div>
  );
}

function NoMatches({ onClear }: { onClear: () => void }) {
  return (
    <div className="panel empty">
      <p className="empty-title">No matching quotes</p>
      <button className="link-btn" onClick={onClear}>Clear search and filter</button>
    </div>
  );
}

export function QuotesPage() {
  const layout = useLayout();
  const { id } = useParams();
  const navigate = useNavigate();
  const { quotes, loading, error } = useData();
  const { search, setSearch, filter, setFilter } = useListState();

  const visible = useMemo(() => quotes.filter((q) => matches(q, search, filter)), [quotes, search, filter]);
  const selected = id ? quotes.find((q) => q.id === id) : undefined;
  const clear = () => {
    setSearch('');
    setFilter('all');
  };
  const backToList = () => navigate('/quotes', { replace: layout !== 'phone' });

  useEffect(() => {
    if (layout !== 'desktop' || !id) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && navigate('/quotes');
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [layout, id, navigate]);

  if (loading) return <div className="loading" aria-busy="true">Loading quotes…</div>;
  if (error && !quotes.length) return <div className="page"><div className="form-error">{error}</div></div>;

  const missing = id && !selected ? <p className="empty">This quote was deleted.</p> : null;
  const list = !quotes.length ? <NoQuotes /> : visible.length ? null : <NoMatches onClear={clear} />;

  // ---------- Phone: the list, or one quote full screen ----------
  if (layout === 'phone') {
    if (id) {
      return (
        <div className="page">
          <button className="back" onClick={() => navigate('/quotes')}><BackIcon /> Quotes</button>
          {selected ? <QuoteDetail quote={selected} onDeleted={backToList} /> : missing}
        </div>
      );
    }
    return (
      <div className="page">
        <header className="page-header"><h1 className="page-title">Quotes</h1></header>
        {quotes.length > 0 && (
          <>
            <Summary filter={filter} onFilter={setFilter} compact />
            <div className="toolbar">
              <SearchBox value={search} onChange={setSearch} />
              <StatusFilter filter={filter} onFilter={setFilter} />
            </div>
          </>
        )}
        {list ?? <QuoteList quotes={visible} />}
      </div>
    );
  }

  // ---------- Tablet: list on the left, quote on the right ----------
  if (layout === 'tablet') {
    return (
      <div className="split">
        <section className="split-list" aria-label="Quotes">
          {quotes.length > 0 && (
            <>
              <Summary filter={filter} onFilter={setFilter} compact />
              <div className="toolbar">
                <SearchBox value={search} onChange={setSearch} />
                <StatusFilter filter={filter} onFilter={setFilter} />
              </div>
            </>
          )}
          {list ?? <QuoteList quotes={visible} selectedId={id} />}
        </section>
        <section className="split-detail" aria-label="Quote details">
          {selected ? (
            <QuoteDetail key={selected.id} quote={selected} onDeleted={backToList} />
          ) : (
            missing ?? <div className="select-note">{quotes.length ? 'Select a quote to see its details.' : 'Your quotes will appear here.'}</div>
          )}
        </section>
      </div>
    );
  }

  // ---------- Computer: summary strip + sortable, searchable table ----------
  return (
    <div className="page">
      <header className="page-header">
        <h1 className="page-title">Quotes</h1>
      </header>
      <Summary filter={filter} onFilter={setFilter} />
      {quotes.length > 0 && (
        <div className="toolbar">
          <SearchBox value={search} onChange={setSearch} />
          <StatusFilter filter={filter} onFilter={setFilter} />
        </div>
      )}
      {list ?? <QuoteTable quotes={visible} selectedId={id} />}

      {id && (
        <>
          <div className="drawer-backdrop" onClick={() => navigate('/quotes')} />
          <aside className="drawer" aria-label="Quote details">
            <button className="drawer-close" onClick={() => navigate('/quotes')} aria-label="Close"><XIcon /></button>
            {selected ? <QuoteDetail key={selected.id} quote={selected} onDeleted={backToList} /> : missing}
          </aside>
        </>
      )}
    </div>
  );
}
