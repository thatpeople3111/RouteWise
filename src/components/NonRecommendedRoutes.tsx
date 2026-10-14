import RouteCard from './RouteCard';
import type { Location, RouteOption, SuggestedStop } from '@/lib/types';
import type { NormalNavigationEndpoints } from '@/lib/startNavigation';

export default function NonRecommendedRoutes({ routes, origin, destination, variant = 'results', selectedStop, navigation }: {
  navigation?: NormalNavigationEndpoints;
  routes: readonly RouteOption[]; origin: Location; destination: Location;
  variant?: 'results' | 'stranded'; selectedStop?: SuggestedStop | null;
}) {
  if (!routes.length) return null;
  return <details className={`non-recommended-routes ${variant === 'stranded' ? 'is-stranded' : ''}`}>
    <summary>Show non-recommended routes</summary>
    <div className="non-recommended-route-list">
      {routes.map(route => <RouteCard key={route.id} route={route} origin={origin} destination={destination} variant={variant} selectedStop={selectedStop} navigation={navigation} />)}
    </div>
  </details>;
}
