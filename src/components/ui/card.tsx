import React from 'react';

export interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  children?: React.ReactNode;
  className?: string;
}

export const Card: React.FC<CardProps> = ({ children, className = '', ...props }) => {
  return (
    <div
      className={`rounded-xl border border-slate-200 bg-white p-6 shadow-xs transition-shadow hover:shadow-sm dark:border-slate-800 dark:bg-slate-900/60 dark:backdrop-blur-sm ${className}`}
      {...props}
    >
      {children}
    </div>
  );
};

export const CardHeader: React.FC<{
  title?: string;
  subtitle?: string;
  action?: React.ReactNode;
  className?: string;
  children?: React.ReactNode;
}> = ({
  title,
  subtitle,
  action,
  className = '',
  children,
}) => {
  if (children) {
    return (
      <div className={`flex flex-col space-y-1.5 pb-4 border-b border-slate-100 dark:border-slate-800 ${className}`}>
        {children}
      </div>
    );
  }
  return (
    <div className={`flex items-start justify-between pb-4 border-b border-slate-100 dark:border-slate-800 ${className}`}>
      <div>
        {title && <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100">{title}</h3>}
        {subtitle && <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">{subtitle}</p>}
      </div>
      {action && <div>{action}</div>}
    </div>
  );
};

export const CardTitle: React.FC<{ children: React.ReactNode; className?: string }> = ({
  children,
  className = '',
}) => (
  <h3 className={`text-base font-semibold text-slate-900 dark:text-slate-100 ${className}`}>
    {children}
  </h3>
);

export const CardDescription: React.FC<{ children: React.ReactNode; className?: string }> = ({
  children,
  className = '',
}) => (
  <p className={`text-xs text-slate-500 dark:text-slate-400 mt-0.5 ${className}`}>
    {children}
  </p>
);

export const CardContent: React.FC<{ children?: React.ReactNode; className?: string }> = ({
  children,
  className = '',
}) => (
  <div className={`pt-4 ${className}`}>
    {children}
  </div>
);
