# User feedback:

_I like also the chat filter function but I see you use only one chat room. It would be nice if I can select my own trade chat room for instance the german trading chat room._

_As tip, you can use "https://www.simcompanies.com/api/v2/contacts/" which shows all chat rooms (for me it shows my german chat rooms as well), and it has "category" key which contains "sales" value. If you filter sales so you could even make in the ui selection what sales chat room we want to use._

_But important: In german rooms they don't use "selling" or "buying" so often. Maybe just ignore selling or buying filter and show all mesages with the choosen resource and since you show the text message, we can see our own if it is sell or buy message._

## Extra technical notes:

### Endpoint

```http
GET https://www.simcompanies.com/api/v2/contacts/
```

### Description

Returns the user’s available chatrooms, recent company chat contacts, unread message counts, and chat visibility/blocking state.

Top-level response

Field | Type | Description
-- | -- | --
chatrooms | array | List of public/system chatrooms available to the user
contacts | array | List of recent company chat contacts
unreadMessagesOtherRealms | array | Unread message counts from other realms
invisible | boolean | Whether the user is invisible in chat
ignoringCompanies | number[] | Company IDs ignored by the user
companiesChatBlockingUs | number[] | Company IDs that have blocked chat from the user


chatrooms[]

Field | Type | Description
-- | -- | --
name | string | Display name of the chatroom
language | string | Language code, e.g. en
category | string | Room category, e.g. game, help, sales, social
image | string | Relative path to chatroom icon
db_letter | string | Internal chatroom identifier
realmsShared | boolean | Whether the room is shared across realms
protectedForCountry | string \| null | Country restriction, if any
show_rules | boolean | Whether rules should be shown for this room
unread | number | Unread message count
datetime | string | ISO timestamp of latest room activity


contacts[]

Field | Type | Description
-- | -- | --
company | string | Company display name
logo | string | Company logo URL, or empty string
certificates | number | Number of certificates held by the company
companyId | number | Unique company ID
lastMessageId | number | Latest message ID in the conversation
chatBlocked | boolean | Whether chat with this company is blocked
unread | number | Unread message count from this contact
pinned | boolean | Whether this contact is pinned
realm | number | Realm ID
supporter | boolean | Whether the company is a supporter

unreadMessagesOtherRealms[]

Field | Type | Description
-- | -- | --
realm | number | Realm ID
unread | number | Unread message count for that realm


### Challenges
Now the problem is that I have both a chat altert and a chat filter. The two functionalities should probably be merged somehow.

### The idea
There will be only one chat filter, that chat filter will combine the search functionality for the current chat filter with the alert functionality of the chat alerts.

The chat filter will allow users to search through all the chatrooms they have joined. These chatrooms can be fetched using the GET https://www.simcompanies.com/api/v2/contacts/, the `db_letter` field is the identifier of the chatroom/

A chatroom's chat's can be retrieved by performing a call to `https://www.simcompanies.com/api/v2/chatroom/<db_letter>` and subsequent chats can be retrieved using `https://www.simcompanies.com/api/v2/chatroom/<db_letter>/from-id/<last_id>/` (this is basically a paginated api).

A user should be able to perform a chat for a certain good like they are capable now and optionally quality. So don't change the functionality of the search just enhance it with the possibility to select the room where the search should be done. Don't give the power to the suer to select multiple rooms cause this will spam the server. Keep all thresholds available today.

