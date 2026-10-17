import { Route, Router, type RouteSectionProps } from '@solidjs/router';
import { render } from 'solid-js/web';
import { initPreviewOrigin } from './api';
import { Shell } from './components/Shell';
import { DesignSystems } from './pages/DesignSystems';
import { Home } from './pages/Home';
import { Library } from './pages/Library';
import { Projects } from './pages/Projects';
import { Studio } from './pages/Studio';
import './styles.css';

const Entry = (props: RouteSectionProps) => <Shell>{props.children}</Shell>;

initPreviewOrigin().then(() => render(
  () => (
    <Router>
      <Route path="/projects/:id" component={Studio} />
      <Route path="/" component={Entry}>
        <Route path="/" component={Home} />
        <Route path="/projects" component={Projects} />
        <Route path="/design-systems/:id?" component={DesignSystems} />
        <Route path="/plugins" component={Library} />
      </Route>
    </Router>
  ),
  document.getElementById('root')!,
));
