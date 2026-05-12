import React, { useEffect } from "react";
import { Link } from "react-router-dom";
import "./NotFoundPage.css";

/**
 * Full-page 404 for unknown routes (same idea as static reference: GIF hero + message + home CTA).
 */
const NotFoundPage = () => {
    useEffect(() => {
        const previousTitle = document.title;
        document.title = "Page not found — Shipt It";
        return () => {
            document.title = previousTitle;
        };
    }, []);

    return (
        <section className="shipt-page-404" aria-labelledby="shipt-404-heading">
            <div className="shipt-page-404__inner">
                <div className="shipt-page-404__hero">
                    <h1 className="shipt-page-404__code">
                        <span className="shipt-page-404__sr">Error 404: page not found. </span>
                        404
                    </h1>
                </div>
                <div className="shipt-page-404__content">
                    <p className="shipt-page-404__brand">Shipt It</p>
                    <h2 id="shipt-404-heading" className="shipt-page-404__title">
                        Looks like you&apos;re lost
                    </h2>
                    <p className="shipt-page-404__text">The page you are looking for is not available.</p>
                    <Link to="/" className="shipt-page-404__cta">
                        Back to home
                    </Link>
                </div>
            </div>
        </section>
    );
};

export default NotFoundPage;
