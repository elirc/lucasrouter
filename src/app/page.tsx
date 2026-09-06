import { ArrowRight, ArrowUpRight, Check, MapPin, Route, Truck, Zap } from 'lucide-react';
import Link from 'next/link';
import { Logo } from '@/components/ui/Logo';
import './home.css';

export default function HomePage() {
  return (
    <div className="home-page">
      <header className="home-nav">
        <Link href="/" aria-label="RouteIQ home"><Logo withWordmark size={32} /></Link>
        <span className="home-location"><span className="live-dot" /> Madison, Wisconsin</span>
        <Link href="/dispatch" className="home-nav-link">Open workspace <ArrowUpRight size={16} /></Link>
      </header>
      <main>
        <section className="home-hero">
          <div className="home-copy">
            <div className="eyebrow"><span className="live-dot" /> LESS PLANNING. MORE DELIVERING.</div>
            <h1>A better route.<br /><span>A smoother day.</span></h1>
            <p>Your stops, your fleet, one clear plan. Turn a day of deliveries into efficient routes, then keep every driver moving.</p>
            <div className="home-actions">
              <Link href="/dispatch" className="home-primary">Open Dispatcher <ArrowRight size={18} /></Link>
              <Link href="/driver" className="home-secondary">Open Driver App <Truck size={18} /></Link>
            </div>
            <div className="home-footnote"><Check size={15} /> Ready-to-use demo <span>·</span> No sign-up needed</div>
          </div>
          <div className="route-preview">
            <div className="preview-toolbar"><span><span className="live-dot" /> YOUR DAY, CONNECTED</span><span>Madison, WI</span></div>
            <svg viewBox="0 0 520 360" role="img" aria-label="Schematic delivery map with three color-coded routes around Madison">
              <defs><pattern id="streets" width="40" height="40" patternTransform="rotate(-18)" patternUnits="userSpaceOnUse"><path d="M 40 0 L 0 0 0 40" fill="none" stroke="#d6e2dc" strokeWidth="1" /></pattern></defs>
              <rect width="520" height="360" fill="#eef3ef" /><rect width="520" height="360" fill="url(#streets)" />
              <path d="M210 0C215 60 300 70 302 125S358 180 418 134S470 80 520 98V0Z" fill="#c5dce0" />
              <path d="M260 360C260 300 320 282 370 255S448 248 470 280L520 340V360Z" fill="#c5dce0" />
              <text x="355" y="77" fill="#607e85" fontSize="12" fontStyle="italic">Lake Mendota</text>
              <text x="383" y="322" fill="#607e85" fontSize="12" fontStyle="italic">Lake Monona</text>
              <g fill="none" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round">
                <path d="M360 150L320 186L259 193L210 142L151 146L104 98L67 121" stroke="#287666" />
                <path d="M360 150L407 184L447 169L471 212L432 250L380 226L320 244" stroke="#d18131" />
                <path d="M360 150L310 177L281 222L225 247L182 217L136 248L100 218" stroke="#6766b4" />
              </g>
              {[[320,186],[210,142],[104,98],[67,121]].map(([cx,cy],i) => <g key={i}><circle cx={cx} cy={cy} r="11" fill="#287666" stroke="white" strokeWidth="3" /><text x={cx} y={cy+4} textAnchor="middle" fill="white" fontSize="10" fontWeight="600">{i+1}</text></g>)}
              {[[407,184],[471,212],[432,250]].map(([cx,cy],i) => <circle key={i} cx={cx} cy={cy} r="8" fill="#d18131" stroke="white" strokeWidth="3" />)}
              {[[281,222],[225,247],[136,248],[100,218]].map(([cx,cy],i) => <circle key={i} cx={cx} cy={cy} r="8" fill="#6766b4" stroke="white" strokeWidth="3" />)}
              <rect x="345" y="134" width="30" height="30" rx="9" fill="#163e35" stroke="white" strokeWidth="3" /><path d="M353 154V145L360 141L367 145V154Z" fill="none" stroke="white" strokeWidth="1.5" />
              <text x="334" y="123" fill="#30473f" fontSize="11" fontWeight="600">YOUR DEPOT</text>
              <text x="210" y="293" fill="#566d64" fontSize="11" letterSpacing="3">MADISON</text>
            </svg>
            <div className="preview-summary"><span className="preview-check"><Check size={20} /></span><div><strong>A place for every stop</strong><span>Three routes. One coordinated team.</span></div><Route size={24} /></div>
            <div className="preview-caption">Illustrative route preview</div>
          </div>
        </section>
        <section className="home-numbers" aria-label="Demo fleet"><div><strong>45</strong><span>delivery stops</span></div><div><strong>3</strong><span>drivers ready</span></div><div><strong>1</strong><span>connected workspace</span></div><p>Built around the way<br />your team moves.</p></section>
        <section className="home-workflow" aria-labelledby="workflow-title">
          <div><span className="eyebrow">FROM FIRST STOP TO LAST MILE</span><h2 id="workflow-title">Good days start with a plan.</h2></div>
          <div className="workflow-grid">
            <article><span className="workflow-icon"><MapPin size={22} /></span><small>01 / PLAN</small><h3>See the whole day.</h3><p>Every stop and delivery window in one place. Search addresses and see what needs attention.</p></article>
            <article><span className="workflow-icon"><Zap size={22} /></span><small>02 / OPTIMIZE</small><h3>Make every mile count.</h3><p>Build balanced routes, compare distance and time, and adjust assignments as the day changes.</p></article>
            <article><span className="workflow-icon"><Truck size={22} /></span><small>03 / DELIVER</small><h3>Keep the next stop clear.</h3><p>Navigate, record delivery proof, and follow progress from the first package to the final drop.</p></article>
          </div>
        </section>
      </main>
      <footer className="home-footer"><Logo withWordmark size={24} /><span>Demo workspace · Mock deliveries in Madison, WI</span><Link href="/dispatch">Let’s get moving <ArrowRight size={15} /></Link></footer>
    </div>
  );
}
