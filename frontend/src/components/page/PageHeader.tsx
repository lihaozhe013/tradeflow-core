import type { ReactElement, ReactNode } from 'react';
import './page.css';

interface PageHeaderProps {
  readonly title: string;
  readonly eyebrow?: string;
  readonly description?: string;
  readonly icon?: ReactNode;
  readonly status?: ReactNode;
  readonly actions?: ReactNode;
}

/**
 * Page header shared by the application pages so each one keeps the same
 * identity block, supporting text and action placement.
 */
function PageHeader({
  title,
  eyebrow,
  description,
  icon,
  status,
  actions
}: PageHeaderProps): ReactElement {
  return (
    <header className="page-header">
      <div className="page-header-main">
        <div className="page-header-identity">
          {icon ? (
            <span className="page-header-icon" aria-hidden="true">
              {icon}
            </span>
          ) : null}
          <div className="page-header-text">
            {eyebrow ? <p className="page-header-eyebrow">{eyebrow}</p> : null}
            <h2 className="page-header-title">{title}</h2>
            {description ? <p className="page-header-description">{description}</p> : null}
          </div>
        </div>
        {status ? <div className="page-header-status">{status}</div> : null}
      </div>
      {actions ? <div className="page-header-actions">{actions}</div> : null}
    </header>
  );
}

export default PageHeader;
