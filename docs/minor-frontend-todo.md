# UIUX TODO
1. usercard on the sidemenu display username and active subcription plan, click on the usercard lead to the user profile page, display using Clerk's UserProfile component (done)
  - Make the usercard on the sidemenu display username and active subcription plan if available (if not then the default display is "Free"). Click on the usercard lead to the user's profile page, displayed using Clerk's UserProfile component. Make the changes frontend-only.

2. fix breadcrumb (done)
  - Reimplement the breadcrumb in the DashboardTopBar so that when click on any linked component other than homepage, practice center, and review center, the breadcrumb will only show the back button and the name of the page, and the back button will route back to the homepage. In other words, no need to build history path for pages other than sub pages in homepage (the progress page count as a sub page of the homepage), practice center, and review center. Refactor the code for the breadcrumb where needed to make the code cleaner and more efficient. Make the changes frontend-only.
  - Change the breadcrumb logic so that the progress page is counted as a sub page of the homepage, and the breadcrumb's history path should be built from the main current section, for example, if the user enter the flashcard from homepage, then the breadcrumb would be homepage > flashcard, or if the user enter the speaking practice from homepage, then the breadcrumb would be homepage > speaking practice. Make the changes frontend-only.

3. mobile view for PWA
  - Since the system is a PWA, update the frontend so that it also have a mobile view. In the mobile view, the sidemenu should be hidden by default and should be accessible with an hamburger menu icon button on the top of the right side of the screen. When click on the hamburger menu icon button, the sidemenu appear from the right side, on top of the screen, and would retract back to hidden when click on anywhere on the screen outside of the sidemenu. Other components should be suitably scaled with the screen size.

4. Sign out button (done)
  - Add sign out button to the user profile page using Clerk's SignOutButton component. Try embed the SignOutButton component into the UserProfile component, if that is impossible, then put the SignOutButton component below the UserProfile component. Make the changes frontend-only.

5. 

6. onboarding assessment UX fix